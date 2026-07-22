import * as React from "react";
import { ChevronDown, ListTree } from "lucide-react";
import type { Block } from "./NotionEditor";

/* DocumentOutline — a live table-of-contents derived from the document's headings. It
   click-scrolls to a section, highlights the active section as you scroll, collapses, and
   updates live as you edit (it is a pure function of `blocks` + the editor's live DOM).
   Entity-agnostic: it reads block rows by their `data-testid="block-<id>"` inside the passed
   scroll container, so it needs no coupling to the editor's internals. */

export interface OutlineHeading { id: string; text: string; level: number }

/* strip inline markup/tokens so a heading reads as clean prose in the rail */
const stripInline = (t: string) =>
  (t || "")
    .replace(/\[\[[ch]:[a-z]+\|([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|\+\+|==|`|\*|_)/g, "")
    .trim();

export function outlineFromBlocks(blocks: Block[]): OutlineHeading[] {
  const out: OutlineHeading[] = [];
  for (const b of blocks) {
    if (b.type === "h1" || b.type === "h2" || b.type === "h3") {
      out.push({ id: b.id, text: stripInline(b.text) || "Untitled", level: b.type === "h1" ? 1 : b.type === "h2" ? 2 : 3 });
    }
  }
  return out;
}

export function DocumentOutline({ blocks, containerRef, className, defaultCollapsed, onNavigate }: {
  blocks: Block[];
  containerRef: React.RefObject<HTMLElement | null>;
  className?: string;
  defaultCollapsed?: boolean;
  onNavigate?: (id: string) => void;
}) {
  const headings = React.useMemo(() => outlineFromBlocks(blocks), [blocks]);
  const [active, setActive] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(!!defaultCollapsed);
  const findEl = React.useCallback(
    (id: string) => (containerRef.current?.querySelector(`[data-testid="block-${id}"]`) as HTMLElement | null),
    [containerRef],
  );

  // active-section tracking: on scroll, the last heading whose top has crossed the fold line
  React.useEffect(() => {
    if (!headings.length) return;
    const scroller = containerRef.current;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const foldTop = (scroller?.getBoundingClientRect().top ?? 0) + 96;
      let cur: string | null = headings[0]?.id ?? null;
      for (const h of headings) {
        const el = findEl(h.id); if (!el) continue;
        if (el.getBoundingClientRect().top - foldTop <= 4) cur = h.id; else break;
      }
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(compute); };
    compute();
    const scrolls = scroller && scroller.scrollHeight > scroller.clientHeight + 4;
    const target: Window | HTMLElement = scrolls ? scroller : window;
    target.addEventListener("scroll", onScroll, { passive: true } as AddEventListenerOptions);
    window.addEventListener("resize", onScroll);
    return () => { cancelAnimationFrame(raf); target.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); };
  }, [headings, containerRef, findEl]);

  const jump = (id: string) => {
    const el = findEl(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(id);
    onNavigate?.(id);
  };

  return (
    <nav className={`ne-outline${collapsed ? " is-collapsed" : ""}${className ? " " + className : ""}`} aria-label="Document outline" data-testid="doc-outline">
      <style>{OUTLINE_CSS}</style>
      <div className="ne-outline-head">
        <span className="ne-outline-title"><ListTree size={13} /> Outline</span>
        <button className="ne-outline-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} data-testid="outline-collapse" title={collapsed ? "Expand outline" : "Collapse outline"}>
          <ChevronDown size={15} />
        </button>
      </div>
      {!collapsed && (
        headings.length ? (
          <ul className="ne-outline-list">
            {headings.map((h) => (
              <li key={h.id} className={`ne-outline-i lvl-${h.level}${active === h.id ? " is-active" : ""}`}>
                <button data-testid={`outline-${h.id}`} onClick={() => jump(h.id)} title={h.text}>{h.text}</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ne-outline-empty">Headings you add appear here.</div>
        )
      )}
    </nav>
  );
}

const OUTLINE_CSS = `
.ne-outline{font-family:var(--nx-font-sans);width:100%;max-width:230px;align-self:flex-start;position:sticky;top:16px}
.ne-outline-head{display:flex;align-items:center;justify-content:space-between;padding:2px 4px 8px}
.ne-outline-title{display:inline-flex;align-items:center;gap:6px;font-family:var(--nx-font-mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--nx-fg-faint)}
.ne-outline-toggle{display:grid;place-items:center;width:22px;height:22px;border:0;background:none;color:var(--nx-fg-faint);cursor:pointer;border-radius:5px;transition:background var(--nx-t-fast),transform var(--nx-t-fast)}
.ne-outline-toggle:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-outline.is-collapsed .ne-outline-toggle{transform:rotate(-90deg)}
.ne-outline-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.ne-outline-i button{display:block;width:100%;text-align:left;border:0;background:none;cursor:pointer;color:var(--nx-fg-muted);font-size:13px;line-height:1.35;padding:4px 8px;border-radius:6px;border-left:2px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color var(--nx-t-fast),background var(--nx-t-fast),border-color var(--nx-t-fast)}
.ne-outline-i button:hover{background:var(--nx-bg-sunken);color:var(--nx-fg)}
.ne-outline-i.lvl-2 button{padding-left:20px;font-size:12.5px}
.ne-outline-i.lvl-3 button{padding-left:32px;font-size:12px;color:var(--nx-fg-faint)}
.ne-outline-i.is-active button{color:var(--nx-accent);border-left-color:var(--nx-accent);background:var(--nx-accent-soft);font-weight:600}
.ne-outline-empty{padding:6px 8px;font-size:12px;color:var(--nx-fg-faint);line-height:1.5}
@media (max-width:900px){.ne-outline{max-width:none}}
`;
