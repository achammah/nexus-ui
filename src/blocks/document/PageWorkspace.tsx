import * as React from "react";
import { ChevronRight, ChevronLeft, PanelLeft, Search, CornerDownLeft, FileText } from "lucide-react";
import { DocumentSurface, useTouchLayout, type DocumentConfig } from "./DocumentSurface";
import { PageTree } from "./PageTree";
import { type PageContext } from "../../record-core/NotionEditor";
import type { DocumentSnapshot } from "./snapshot";
import { PageIcon } from "../../record-core/PageIcon";
import {
  seedPageStore, createPage, duplicatePage, deletePage, movePage, renamePage, setPageIcon, setPageCover,
  setPageBlocks, toggleFavorite, setActive, setExpanded, breadcrumb, backlinksOf, searchPages, rootPages,
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

export interface PageWorkspaceProps {
  value: PageStore | null;
  onChange?: (store: PageStore) => void;
  reloadNonce?: number;
  className?: string;
  readOnly?: boolean;
  documentConfig?: DocumentConfig;   // forwarded to the per-page DocumentSurface
  /* Set false when the HOST already renders a breadcrumb for this page — the workspace then
     renders no trail of its own, so the surface never stacks two of them. */
  breadcrumbs?: boolean;
  "data-testid"?: string;
}

export function PageWorkspace({ value, onChange, reloadNonce = 0, className, readOnly, documentConfig, breadcrumbs = true, ...rest }: PageWorkspaceProps) {
  const showCrumbs = breadcrumbs !== false;
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setSwitcher((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!active) {
    return <div className={`nxWs${className ? " " + className : ""}`} {...rest}><div className="nxWs-blank"><FileText size={22} /><p>No pages yet.</p><button onClick={() => create(null)}>Create the first page</button></div></div>;
  }

  const activeSnap: DocumentSnapshot = { id: active.id, title: active.title, icon: active.icon, cover: active.cover, coverY: active.coverY, blocks: active.blocks, pageWidth: "narrow" };
  const onDocChange = (snap: DocumentSnapshot) => mutate((s) => {
    let n = setPageBlocks(s, active.id, snap.blocks);
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
      {!sidebar && <button className="nxWs-iconbtn" title="Show pages" data-testid="ws-show-sidebar" onClick={() => setSidebar(true)}><PanelLeft size={15} /></button>}
      {/* touch: the trail collapses to a BACK affordance to the parent page — a full trail
          does not fit, and "up one level" is the gesture a sub-page actually needs */}
      {touch && parent && (
        <button className="nxWs-back" data-testid="ws-back" onClick={() => open(parent.id)}>
          <ChevronLeft size={16} /><span>{parent.title || "Untitled"}</span>
        </button>
      )}
      {touch && (
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
      {showCrumbs && !touch && <button className="nxWs-kbar" data-testid="ws-search" onClick={() => setSwitcher(true)}><Search size={13} /><span className="nxWs-kbar-tx">Search</span><kbd>⌘K</kbd></button>}
    </div>
  );

  const footer = backs.length > 0 && (
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

  return (
    <div className={`nxWs${sidebar ? "" : " is-collapsed"}${className ? " " + className : ""}`} data-testid="page-workspace" {...rest}>
      {/* the drawer is modal on touch: a scrim to tap away, and opening a page closes it */}
      {sidebar && touch && <div className="nxWs-scrim" data-testid="ws-scrim" onClick={() => setSidebar(false)} />}
      {sidebar && (
        <aside className="nxWs-sidebar" data-testid="ws-sidebar">
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
            onSearch={() => setSwitcher(true)}
          />
        </aside>
      )}
      <div className="nxWs-main">
        <DocumentSurface
          key={active.id}
          value={activeSnap}
          onChange={onDocChange}
          readOnly={readOnly}
          config={documentConfig}
          pageContext={pageContext}
          topBar={topBar}
          footer={footer}
        />
      </div>

      {switcher && <QuickSwitcher store={store} onOpen={open} onClose={() => setSwitcher(false)} />}
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

export default PageWorkspace;
