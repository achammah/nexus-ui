import * as React from "react";
import { ChevronRight, Plus, MoreHorizontal, Star, Copy, Trash2, FileText, Search, PencilLine, PanelLeft } from "lucide-react";
import { childrenOf, favorites, type PageStore, type PageNode } from "./page-store";
import { PageIcon } from "../../record-core/PageIcon";

/* PageTree — the workspace sidebar. Renders the page hierarchy (derived live from the flat
   store), with expand/collapse, drag-to-move (before / after / inside a target, via the
   store's movePage), per-node actions (new sub-page, favorite, duplicate, delete), and a
   Favorites shelf. Presentation only — the host owns every store mutation through callbacks. */

export interface PageTreeProps {
  store: PageStore;
  activeId?: string;
  onOpen: (id: string) => void;
  onCreate: (parentId: string | null) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onFavorite: (id: string) => void;
  onMove: (id: string, newParentId: string | null, afterId?: string | null) => void;
  onToggleExpand: (id: string, open: boolean) => void;
  onRename?: (id: string, title: string) => void;  // double-click a row, or the ••• menu
  onSearch?: () => void;    // opens the quick-switcher
  onCollapse?: () => void;  // hides the sidebar (rendered in the tree head, not a panel bar)
  className?: string;
}

type DropPos = "before" | "after" | "inside";

export function PageTree({ store, activeId, onOpen, onCreate, onDuplicate, onDelete, onFavorite, onMove, onToggleExpand, onRename, onSearch, onCollapse, className }: PageTreeProps) {
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [drop, setDrop] = React.useState<{ id: string; pos: DropPos } | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const roots = childrenOf(store, null);
  const favs = favorites(store);

  React.useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".nxTree-menu, .nxTree-more")) setMenuFor(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuFor]);

  const commitDrop = (targetId: string) => {
    const d = drop; setDrop(null); const id = dragId; setDragId(null);
    if (!d || !id || id === targetId) return;
    const target = store.pages[targetId]; if (!target) return;
    if (d.pos === "inside") { onMove(id, targetId, null); onToggleExpand(targetId, true); return; }
    const sibs = childrenOf(store, target.parentId).filter((p) => p.id !== id);
    const i = sibs.findIndex((p) => p.id === targetId);
    if (d.pos === "before") onMove(id, target.parentId, i <= 0 ? "start" : sibs[i - 1].id);
    else onMove(id, target.parentId, targetId);
  };

  /* a render FUNCTION, not a nested component: a component declared inside the render body
     is a NEW type on every render, so React unmounts and remounts the whole tree on each
     state change — which tears down an in-flight rename input (and every focus/drag state)
     the instant it opens. */
  const renderNode = (page: PageNode, depth: number): React.ReactNode => {
    const kids = childrenOf(store, page.id);
    const open = store.expanded?.[page.id] ?? false;
    const isDrop = drop?.id === page.id;
    return (
      <div className="nxTree-branch" key={page.id}>
        <div
          className={`nxTree-row${activeId === page.id ? " is-active" : ""}${dragId === page.id ? " is-dragging" : ""}${isDrop ? " drop-" + drop!.pos : ""}`}
          style={{ paddingInlineStart: 6 + depth * 14 }}
          data-testid={`tree-row-${page.id}`}
          draggable
          onClick={() => { if (renaming !== page.id) onOpen(page.id); }}
          onDoubleClick={(e) => { if (onRename) { e.stopPropagation(); setRenaming(page.id); } }}
          onDragStart={(e) => { setDragId(page.id); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", page.id); } catch { /* noop */ } }}
          onDragEnd={() => { setDragId(null); setDrop(null); }}
          onDragOver={(e) => {
            if (!dragId || dragId === page.id) return; e.preventDefault();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            const pos: DropPos = y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
            if (drop?.id !== page.id || drop.pos !== pos) setDrop({ id: page.id, pos });
          }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); commitDrop(page.id); }}
        >
          <button className={`nxTree-caret${kids.length ? "" : " is-leaf"}${open ? " is-open" : ""}`} aria-label={open ? "Collapse" : "Expand"} data-testid={`tree-caret-${page.id}`}
            onClick={(e) => { e.stopPropagation(); if (kids.length) onToggleExpand(page.id, !open); }}>
            {kids.length ? <ChevronRight size={13} /> : <span className="nxTree-dot" />}
          </button>
          <span className="nxTree-ic"><PageIcon icon={page.icon} size={15} fallback={<FileText size={14} />} /></span>
          {renaming === page.id && onRename ? (
            <input className="nxTree-rename" autoFocus defaultValue={page.title} data-testid={`tree-rename-${page.id}`}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { onRename(page.id, e.currentTarget.value); setRenaming(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onRename(page.id, e.currentTarget.value); setRenaming(null); }
                else if (e.key === "Escape") { e.preventDefault(); setRenaming(null); }
              }} />
          ) : (
            <span className="nxTree-title">{page.title || "Untitled"}</span>
          )}
          {page.favorite && <Star size={11} className="nxTree-fav" />}
          <span className="nxTree-actions">
            <button className="nxTree-add" title="Add a page inside" data-testid={`tree-add-${page.id}`} onClick={(e) => { e.stopPropagation(); onCreate(page.id); onToggleExpand(page.id, true); }}><Plus size={13} /></button>
            <button className="nxTree-more" title="More" data-testid={`tree-more-${page.id}`} onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === page.id ? null : page.id); }}><MoreHorizontal size={14} /></button>
          </span>
          {menuFor === page.id && (
            <div className="nxTree-menu nx-pop-in" data-testid={`tree-menu-${page.id}`} onClick={(e) => e.stopPropagation()}>
              {onRename && <button onClick={() => { setMenuFor(null); setRenaming(page.id); }} data-testid={`tree-rename-open-${page.id}`}><PencilLine size={14} /> Rename</button>}
              <button onClick={() => { onFavorite(page.id); setMenuFor(null); }} data-testid={`tree-favorite-${page.id}`}><Star size={14} /> {page.favorite ? "Remove favorite" : "Favorite"}</button>
              <button onClick={() => { onDuplicate(page.id); setMenuFor(null); }} data-testid={`tree-dup-${page.id}`}><Copy size={14} /> Duplicate</button>
              <button className="is-danger" onClick={() => { onDelete(page.id); setMenuFor(null); }} data-testid={`tree-del-${page.id}`}><Trash2 size={14} /> Delete</button>
            </div>
          )}
        </div>
        {open && kids.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  return (
    <nav className={`nxTree${className ? " " + className : ""}`} aria-label="Pages" data-testid="page-tree">
      {/* the tree's own head IS the sidebar head — no separate panel bar above it */}
      <div className="nxTree-head">
        <span className="nxTree-head-actions">
          {onSearch && <button className="nxTree-hbtn" title="Search (⌘K)" data-testid="tree-search" onClick={onSearch}><Search size={14} /></button>}
          <button className="nxTree-hbtn" title="New page" data-testid="tree-new-root" onClick={() => onCreate(null)}><Plus size={15} /></button>
        </span>
        {onCollapse && <button className="nxTree-hbtn" title="Hide sidebar" data-testid="ws-hide-sidebar" onClick={onCollapse}><PanelLeft size={15} /></button>}
      </div>
      {favs.length > 0 && (
        <div className="nxTree-section">
          <div className="nxTree-section-h">Favorites</div>
          {favs.map((p) => (
            <div key={"fav-" + p.id} className={`nxTree-row is-fav-row${activeId === p.id ? " is-active" : ""}`} style={{ paddingInlineStart: 8 }} data-testid={`fav-row-${p.id}`} onClick={() => onOpen(p.id)}>
              <span className="nxTree-caret is-leaf"><span className="nxTree-dot" /></span>
              <span className="nxTree-ic"><PageIcon icon={p.icon} size={15} fallback={<Star size={13} />} /></span>
              <span className="nxTree-title">{p.title || "Untitled"}</span>
            </div>
          ))}
        </div>
      )}
      <div className="nxTree-section">
        <div className="nxTree-section-h">Pages</div>
        {roots.map((p) => renderNode(p, 0))}
        {roots.length === 0 && <button className="nxTree-empty" onClick={() => onCreate(null)}><Plus size={14} /> New page</button>}
        {/* a drop zone to move a page back to the top level */}
        {dragId && (
          <div className={`nxTree-rootdrop${drop?.id === "__root__" ? " is-over" : ""}`} data-testid="tree-root-drop"
            onDragOver={(e) => { e.preventDefault(); setDrop({ id: "__root__", pos: "inside" }); }}
            onDrop={(e) => { e.preventDefault(); const id = dragId; setDrop(null); setDragId(null); if (id) onMove(id, null, null); }}>
            Move to top level
          </div>
        )}
      </div>
    </nav>
  );
}
