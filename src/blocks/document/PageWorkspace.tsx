import * as React from "react";
import { ChevronRight, ChevronLeft, PanelLeft, Search, CornerDownLeft, FileText, Plus } from "lucide-react";
import { DocumentSurface, useTouchLayout, type DocumentConfig } from "./DocumentSurface";
import { PageTree } from "./PageTree";
import { type PageContext } from "../../record-core/NotionEditor";
import type { DocumentSnapshot } from "./snapshot";
import { PageIcon } from "../../record-core/PageIcon";
import {
  seedPageStore, createPage, duplicatePage, deletePage, movePage, renamePage, setPageIcon, setPageCover,
  setPageBlocks, setPageSuggestions, toggleFavorite, setActive, setExpanded, breadcrumb, backlinksOf, searchPages, rootPages, childrenOf,
  type PageStore, type PageNode,
} from "./page-store";
import "./page-workspace.css";

/* PageWorkspace — the standalone LINKED PAGE WORKSPACE. In Notion "everything is a page;
   pages nest and reference each other" — this is that surface. It owns the page store
   (free-surface value/onChange, the same contract as WorkbookSurface/DocumentSurface, but
   the value is the whole PageStore), renders the page-tree sidebar + breadcrumbs + Cmd-K
   quick-switcher + backlinks, and mounts a DocumentSurface for the ACTIVE page — wiring the
   pageContext seam so sub-page blocks and [[page:]] links resolve/open/create against the
   store. This is what a Pages host mounts for a kind:"document" page. */

/* Composability — ONE document surface, dialable across a SPECTRUM from a simple Word-like doc
   (with track-changes) all the way to a full Notion workspace. Every structural element is an
   independent toggle; named LAYOUT PRESETS mark points along the range. `suggestions`
   (track-changes) is ORTHOGONAL — available at every level, so "simple doc + suggestions" and
   "full notion + suggestions" are both one flag away. Explicit flags override the preset;
   anything left undefined inherits it. The surface degrades coherently (drop the tree and its
   collapse control goes; drop breadcrumbs and ⌘K moves to the tree head). Spectrum + worked
   examples → docs/RECIPES.md.

   The preset range, minimal → maximal:
     doc        — a single focused document. No nav chrome. (a Word-like doc)
     review     — a single document tuned for review: fixed reading width, no cover.
     wiki       — nested pages + tree + backlinks + ⌘K. (a knowledge base)
     workspace  — the full Notion: everything on.
   Plus two shape variants: library (pages as a table) and single-doc (alias of doc). */
export type TreeMode = "sidebar" | "off" | "table";
export type WorkspaceLayout = "doc" | "review" | "wiki" | "workspace" | "library" | "single-doc";

export interface WorkspaceConfig {
  preset?: WorkspaceLayout;          // a point on the simple→full spectrum (default "wiki")
  tree?: TreeMode;                   // page navigation: nested sidebar | none | a library table
  breadcrumbs?: boolean;             // the workspace trail
  backlinks?: boolean;               // "linked references" panel
  cmdK?: boolean;                    // ⌘K quick-switcher + its search entries
  suggestions?: boolean;             // track-changes / suggesting mode — ORTHOGONAL, any level
  outline?: boolean;                 // per-page outline rail/sheet
  cover?: boolean;                   // per-page cover image
  icons?: boolean;                   // per-page icon/emoji
  export?: boolean;                  // the import/export menu
  wordCount?: boolean;               // the word/char readout
  pageWidth?: boolean;               // the narrow/wide toggle
  findReplace?: boolean;             // the find & replace bar
}

type WsFlags = Required<Omit<WorkspaceConfig, "preset">>;
const WORKSPACE_PRESETS: Record<WorkspaceLayout, WsFlags> = {
  // minimal → maximal. suggestions is ON across the whole range (a company turns it off explicitly).
  doc:          { tree: "off",     breadcrumbs: false, backlinks: false, cmdK: false, suggestions: true, outline: true, cover: true,  icons: true, export: true, wordCount: true, pageWidth: true,  findReplace: true },
  review:       { tree: "off",     breadcrumbs: false, backlinks: false, cmdK: false, suggestions: true, outline: true, cover: false, icons: true, export: true, wordCount: true, pageWidth: false, findReplace: true },
  wiki:         { tree: "sidebar", breadcrumbs: true,  backlinks: true,  cmdK: true,  suggestions: true, outline: true, cover: true,  icons: true, export: true, wordCount: true, pageWidth: true,  findReplace: true },
  workspace:    { tree: "sidebar", breadcrumbs: true,  backlinks: true,  cmdK: true,  suggestions: true, outline: true, cover: true,  icons: true, export: true, wordCount: true, pageWidth: true,  findReplace: true },
  library:      { tree: "table",   breadcrumbs: true,  backlinks: true,  cmdK: true,  suggestions: true, outline: true, cover: true,  icons: true, export: true, wordCount: true, pageWidth: true,  findReplace: true },
  "single-doc": { tree: "off",     breadcrumbs: false, backlinks: false, cmdK: false, suggestions: true, outline: true, cover: true,  icons: true, export: true, wordCount: true, pageWidth: true,  findReplace: true },
};

interface ResolvedWs { tree: TreeMode; breadcrumbs: boolean; backlinks: boolean; cmdK: boolean; doc: DocumentConfig }
export function resolveWorkspaceConfig(cfg: WorkspaceConfig | undefined, docCfg: DocumentConfig | undefined): ResolvedWs {
  const base = WORKSPACE_PRESETS[cfg?.preset ?? "wiki"];
  const pick = <K extends keyof WsFlags>(k: K): WsFlags[K] => (cfg?.[k] ?? base[k]) as WsFlags[K];
  return {
    tree: pick("tree"),
    breadcrumbs: pick("breadcrumbs"),
    backlinks: pick("backlinks"),
    cmdK: pick("cmdK"),
    // workspace-level element flags fold into the per-page DocumentConfig; any other
    // DocumentConfig fields (editor block set, chrome) pass through untouched
    // precedence: explicit WorkspaceConfig flag > explicit documentConfig flag > preset default
    doc: {
      ...docCfg,
      suggestions: cfg?.suggestions ?? docCfg?.suggestions ?? base.suggestions,
      outline: cfg?.outline ?? docCfg?.outline ?? base.outline,
      cover: cfg?.cover ?? docCfg?.cover ?? base.cover,
      icon: cfg?.icons ?? docCfg?.icon ?? base.icons,
      importExport: cfg?.export ?? docCfg?.importExport ?? base.export,
      wordCount: cfg?.wordCount ?? docCfg?.wordCount ?? base.wordCount,
      pageWidthToggle: cfg?.pageWidth ?? docCfg?.pageWidthToggle ?? base.pageWidth,
      findReplace: cfg?.findReplace ?? docCfg?.findReplace ?? base.findReplace,
    },
  };
}

/* One entry per page, for a HOST's unified search ("search everything") to surface handbook
   pages alongside its own records — so a company can run a single ⌘K palette (set the
   workspace's own cmdK off) without losing doc pages. `path` is the breadcrumb of ancestor
   titles; `open(id)` is what the host calls to jump to a result. */
export interface PageIndexEntry { id: string; title: string; path: string; icon?: string }

export interface PageWorkspaceProps {
  value: PageStore | null;
  onChange?: (store: PageStore) => void;
  reloadNonce?: number;
  className?: string;
  readOnly?: boolean;
  documentConfig?: DocumentConfig;   // forwarded to the per-page DocumentSurface (editor/chrome)
  config?: WorkspaceConfig;          // composability — element toggles + a layout preset
  author?: { name: string; color?: string };  // the reviewer, for suggesting-mode attribution
  /* Emitted whenever the page set changes — hand this to the app's unified search so it can
     index handbook pages. Pair with `config={{ cmdK: false }}` to let the app own the single
     ⌘K palette. `onOpenPageRef` (optional) receives an opener the host calls to jump to a hit. */
  onPageIndex?: (entries: PageIndexEntry[]) => void;
  onOpenPageRef?: (open: (id: string) => void) => void;
  /* Set false when the HOST already renders a breadcrumb for this page — the workspace then
     renders no trail of its own, so the surface never stacks two of them. Overrides the
     config/preset when explicitly false. */
  breadcrumbs?: boolean;
  "data-testid"?: string;
}

export function PageWorkspace({ value, onChange, reloadNonce = 0, className, readOnly, documentConfig, config, author, onPageIndex, onOpenPageRef, breadcrumbs = true, ...rest }: PageWorkspaceProps) {
  const ws = React.useMemo(() => resolveWorkspaceConfig(config, documentConfig), [config, documentConfig]);
  // the host's explicit breadcrumbs=false (it owns the trail) wins over the preset
  const showCrumbs = breadcrumbs !== false && ws.breadcrumbs;
  const treeMode = ws.tree;
  const showCmdK = ws.cmdK;
  const [store, setStore] = React.useState<PageStore>(() => value ?? seedPageStore());
  const storeRef = React.useRef(store); storeRef.current = store;
  const onChangeRef = React.useRef(onChange); onChangeRef.current = onChange;
  React.useEffect(() => { const s = value ?? seedPageStore(); storeRef.current = s; setStore(s); /* eslint-disable-next-line */ }, [reloadNonce]);

  // one mutation path — always reads the LATEST store (ref) so editor callbacks are correct
  const mutate = React.useCallback((fn: (s: PageStore) => PageStore) => {
    const next = fn(storeRef.current); storeRef.current = next; setStore(next); onChangeRef.current?.(next);
  }, []);

  const touch = useTouchLayout();
  // on narrow screens the tree is an overlay drawer — it starts closed, as a drawer should
  const [sidebar, setSidebar] = React.useState(() => (typeof window === "undefined" ? true : window.innerWidth > 820));
  const [switcher, setSwitcher] = React.useState(false);

  const active: PageNode | undefined = store.pages[store.activeId ?? ""] ?? rootPages(store)[0];

  const open = React.useCallback((id: string) => {
    if (storeRef.current.pages[id]) mutate((s) => setActive(s, id));
    setSwitcher(false);
    // a modal drawer must get out of the way once it has done its job
    if (window.matchMedia("(pointer: coarse) and (max-width: 820px)").matches) setSidebar(false);
  }, [mutate]);
  const create = (parentId: string | null) => { const r = createPage(storeRef.current, { parentId, title: "" }); mutate(() => setActive(parentId ? setExpanded(r.store, parentId, true) : r.store, r.id)); };

  // hand the host an opener once, so its unified search can jump to a page hit
  React.useEffect(() => { onOpenPageRef?.(open); }, [onOpenPageRef, open]);
  // emit the page index for the host's unified search whenever the page set changes (title,
  // structure, or membership) — path is the breadcrumb of ancestor titles
  React.useEffect(() => {
    if (!onPageIndex) return;
    const entries: PageIndexEntry[] = Object.values(store.pages).map((p) => ({
      id: p.id,
      title: p.title || "Untitled",
      path: breadcrumb(store, p.id).slice(0, -1).map((c) => c.title || "Untitled").join(" / "),
      icon: p.icon,
    }));
    onPageIndex(entries);
  }, [store.pages, onPageIndex]);

  // the page-workspace seam handed to the editor
  const pageContext: PageContext = {
    resolve: (id) => { const p = storeRef.current.pages[id]; return p ? { title: p.title || "Untitled", icon: p.icon } : null; },
    search: (q) => (q.trim() ? searchPages(storeRef.current, q, 6).map((h) => ({ id: h.page.id, title: h.page.title || "Untitled", icon: h.page.icon })) : rootPages(storeRef.current).slice(0, 6).map((p) => ({ id: p.id, title: p.title || "Untitled", icon: p.icon }))),
    onOpenPage: (id) => open(id),
    onCreateSubPage: (title) => {
      const parentId = storeRef.current.activeId ?? null;
      const r = createPage(storeRef.current, { parentId, title: title || "Untitled" });
      mutate(() => (parentId ? setExpanded(r.store, parentId, true) : r.store));
      return r.id;
    },
  };

  // ⌘K / Ctrl-K quick-switcher
  React.useEffect(() => {
    if (!showCmdK) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setSwitcher((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showCmdK]);

  if (!active) {
    return <div className={`nxWs${className ? " " + className : ""}`} {...rest}><div className="nxWs-blank"><FileText size={22} /><p>No pages yet.</p><button onClick={() => create(null)}>Create the first page</button></div></div>;
  }

  const activeSnap: DocumentSnapshot = { id: active.id, title: active.title, icon: active.icon, cover: active.cover, coverY: active.coverY, blocks: active.blocks, suggestions: active.suggestions, pageWidth: "narrow" };
  const onDocChange = (snap: DocumentSnapshot) => mutate((s) => {
    let n = setPageBlocks(s, active.id, snap.blocks);
    if (snap.suggestions !== active.suggestions) n = setPageSuggestions(n, active.id, snap.suggestions ?? []);
    if (snap.title !== active.title) n = renamePage(n, active.id, snap.title);
    if (snap.icon !== active.icon) n = setPageIcon(n, active.id, snap.icon);
    if (snap.cover !== active.cover || snap.coverY !== active.coverY) n = setPageCover(n, active.id, snap.cover, snap.coverY);
    return n;
  });

  const crumbs = breadcrumb(store, active.id);
  const backs = backlinksOf(store, active.id);

  /* Notion: double-clicking the current breadcrumb renames the page — here it hands focus to
     the page's own title field (the one true title), which is the same gesture, one surface. */
  const focusTitle = () => {
    const el = document.querySelector('[data-testid="doc-title"]') as HTMLInputElement | null;
    el?.focus(); el?.select();
  };

  /* the workspace ALWAYS owns the header's left slot — a page in a tree already states its
     name in its own H1, so the surface must never fall back to repeating the title here */
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  const topBar = (
    <div className="nxWs-crumbbar" data-testid="ws-breadcrumbs">
      {treeMode !== "off" && !sidebar && <button className="nxWs-iconbtn" title="Show pages" data-testid="ws-show-sidebar" onClick={() => setSidebar(true)}><PanelLeft size={15} /></button>}
      {/* touch: the trail collapses to a BACK affordance to the parent page — a full trail
          does not fit, and "up one level" is the gesture a sub-page actually needs */}
      {touch && parent && (
        <button className="nxWs-back" data-testid="ws-back" onClick={() => open(parent.id)}>
          <ChevronLeft size={16} /><span>{parent.title || "Untitled"}</span>
        </button>
      )}
      {touch && showCmdK && (
        <button className="nxWs-iconbtn nxWs-msearch" title="Search pages" data-testid="ws-search-touch" onClick={() => setSwitcher(true)}><Search size={16} /></button>
      )}
      {showCrumbs && !touch && <nav className="nxWs-crumbs">
        {crumbs.map((c, i) => {
          const isCurrent = i === crumbs.length - 1;
          return (
            <React.Fragment key={c.id}>
              {i > 0 && <ChevronRight size={13} className="nxWs-crumb-sep" />}
              <button className={`nxWs-crumb${isCurrent ? " is-current" : ""}`} data-testid={`crumb-${c.id}`}
                title={isCurrent ? "Double-click to rename" : "Open"}
                onClick={() => (isCurrent ? focusTitle() : open(c.id))}
                onDoubleClick={focusTitle}>
                {c.icon && <span className="nxWs-crumb-ic"><PageIcon icon={c.icon} size={14} /></span>}{c.title || "Untitled"}
              </button>
            </React.Fragment>
          );
        })}
      </nav>}
      {/* only alongside the trail — without it the tree head's search is the single, closer
          entry point, and two search affordances in one row read as clutter */}
      {showCrumbs && showCmdK && !touch && <button className="nxWs-kbar" data-testid="ws-search" onClick={() => setSwitcher(true)}><Search size={13} /><span className="nxWs-kbar-tx">Search</span><kbd>⌘K</kbd></button>}
    </div>
  );

  const footer = ws.backlinks && backs.length > 0 && (
    <div className="nxWs-backlinks" data-testid="ws-backlinks">
      <div className="nxWs-backlinks-h">Linked references · {backs.length}</div>
      {backs.map((b, i) => {
        const from = store.pages[b.fromId]; if (!from) return null;
        return (
          <button key={b.fromId + i} className="nxWs-backlink" data-testid={`backlink-${b.fromId}`} onClick={() => open(b.fromId)}>
            <span className="nxWs-backlink-ic"><PageIcon icon={from.icon} size={16} fallback={<FileText size={13} />} /></span>
            <span className="nxWs-backlink-title">{from.title || "Untitled"}</span>
            <span className="nxWs-backlink-kind">{b.kind === "child" ? "parent" : b.kind === "subpage" ? "sub-page" : "link"}</span>
          </button>
        );
      })}
    </div>
  );

  const hasNav = treeMode !== "off";
  const showSidebar = hasNav && sidebar;
  return (
    <div className={`nxWs${showSidebar ? "" : " is-collapsed"}${className ? " " + className : ""}`} data-testid="page-workspace" {...rest}>
      {/* the drawer is modal on touch: a scrim to tap away, and opening a page closes it */}
      {showSidebar && touch && <div className="nxWs-scrim" data-testid="ws-scrim" onClick={() => setSidebar(false)} />}
      {showSidebar && (
        <aside className="nxWs-sidebar" data-testid="ws-sidebar">
          {treeMode === "table" ? (
            <PageTable
              store={store}
              activeId={active.id}
              onCollapse={() => setSidebar(false)}
              onOpen={open}
              onCreate={() => create(null)}
              onSearch={showCmdK ? () => setSwitcher(true) : undefined}
            />
          ) : (
            <PageTree
              onCollapse={() => setSidebar(false)}
              store={store}
              activeId={active.id}
              onOpen={open}
              onCreate={create}
              onDuplicate={(id) => { const r = duplicatePage(storeRef.current, id); mutate(() => setActive(r.store, r.id)); }}
              onDelete={(id) => mutate((s) => deletePage(s, id))}
              onFavorite={(id) => mutate((s) => toggleFavorite(s, id))}
              onRename={(id, title) => mutate((s) => renamePage(s, id, title))}
              onMove={(id, parent, after) => mutate((s) => movePage(s, id, parent, after))}
              onToggleExpand={(id, o) => mutate((s) => setExpanded(s, id, o))}
              onSearch={showCmdK ? () => setSwitcher(true) : undefined}
            />
          )}
        </aside>
      )}
      <div className="nxWs-main">
        <DocumentSurface
          key={active.id}
          value={activeSnap}
          onChange={onDocChange}
          readOnly={readOnly}
          config={ws.doc}
          author={author}
          pageContext={pageContext}
          topBar={topBar}
          footer={footer}
        />
      </div>

      {switcher && showCmdK && <QuickSwitcher store={store} onOpen={open} onClose={() => setSwitcher(false)} />}
    </div>
  );
}

/* Cmd-K quick-switcher — jump to any page by title or content (full-text). */
function QuickSwitcher({ store, onOpen, onClose }: { store: PageStore; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = React.useState("");
  const [sel, setSel] = React.useState(0);
  const results = React.useMemo(() => (q.trim() ? searchPages(store, q, 20) : rootPages(store).slice(0, 8).map((p) => ({ page: p, where: "title" as const, snippet: p.title || "Untitled" }))), [q, store]);
  React.useEffect(() => setSel(0), [q]);
  return (
    <div className="nxWs-switcher-back" data-testid="quick-switcher" onMouseDown={onClose}>
      <div className="nxWs-switcher" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nxWs-switcher-in">
          <Search size={16} />
          <input autoFocus placeholder="Search or jump to a page…" value={q} data-testid="switcher-input"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); if (results[sel]) onOpen(results[sel].page.id); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }} />
          <kbd>esc</kbd>
        </div>
        <div className="nxWs-switcher-list">
          {results.length === 0 && <div className="nxWs-switcher-empty">No pages match “{q}”.</div>}
          {results.map((r, i) => (
            <button key={r.page.id} className={`nxWs-switcher-i${i === sel ? " is-sel" : ""}`} data-testid={`switcher-opt-${r.page.id}`}
              ref={i === sel ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
              onMouseEnter={() => setSel(i)} onClick={() => onOpen(r.page.id)}>
              <span className="nxWs-switcher-ic"><PageIcon icon={r.page.icon} size={17} fallback={<FileText size={15} />} /></span>
              <span className="nxWs-switcher-tx"><b>{r.page.title || "Untitled"}</b>{r.where === "body" && <i>{r.snippet}</i>}</span>
              {i === sel && <CornerDownLeft size={13} className="nxWs-switcher-enter" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* PageTable — the "library" navigation: every page as a row in a record-table idiom (icon +
   title indented by depth, sub-page count, last-edited), instead of the nested tree. Same
   sidebar location + head controls, so tree↔table is a pure config swap. Rows open a page. */
function PageTable({ store, activeId, onOpen, onCreate, onCollapse, onSearch }: {
  store: PageStore;
  activeId: string;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onCollapse: () => void;
  onSearch?: () => void;
}) {
  // depth-first flatten so the table preserves the page hierarchy as indentation
  const rows = React.useMemo(() => {
    const out: { page: PageNode; depth: number; kids: number }[] = [];
    const walk = (parentId: string | null, depth: number) => {
      for (const p of childrenOf(store, parentId)) {
        const kids = childrenOf(store, p.id).length;
        out.push({ page: p, depth, kids });
        walk(p.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }, [store]);
  const edited = (t: number) => {
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d}d ago` : new Date(t).toLocaleDateString();
  };
  return (
    <div className="nxWs-table" data-testid="ws-page-table">
      <div className="nxTree-head">
        <span className="nxTree-head-tx">All pages</span>
        <div className="nxTree-head-actions">
          {onSearch && <button className="nxTree-hbtn" title="Search (⌘K)" data-testid="table-search" onClick={onSearch}><Search size={14} /></button>}
          <button className="nxTree-hbtn" title="New page" data-testid="table-new" onClick={onCreate}><Plus size={15} /></button>
          <button className="nxTree-hbtn" title="Hide sidebar" data-testid="ws-hide-sidebar" onClick={onCollapse}><PanelLeft size={15} /></button>
        </div>
      </div>
      <div className="nxWs-table-head" role="row">
        <span>Page</span><span className="nxWs-table-meta">Edited</span>
      </div>
      <div className="nxWs-table-body">
        {rows.map(({ page, depth, kids }) => (
          <button key={page.id} className={`nxWs-table-row${activeId === page.id ? " is-active" : ""}`}
            data-testid={`table-row-${page.id}`} onClick={() => onOpen(page.id)}>
            <span className="nxWs-table-name" style={{ paddingInlineStart: 8 + depth * 16 }}>
              <span className="nxWs-table-ic"><PageIcon icon={page.icon} size={16} fallback={<FileText size={13} />} /></span>
              <span className="nxWs-table-title">{page.title || "Untitled"}</span>
              {kids > 0 && <span className="nxWs-table-count">{kids}</span>}
            </span>
            <span className="nxWs-table-meta">{edited(page.updatedAt)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default PageWorkspace;
