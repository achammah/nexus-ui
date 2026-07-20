import * as React from "react";
import { Check, X, CornerUpLeft, MessageSquareText } from "lucide-react";
import type { Suggestion } from "./useSuggestions";

/* SuggestionPanel — the review rail for inline tracked changes: one card per change
   (its del → ins diff + reason), accept / reject on the pending ones, undo on the
   resolved ones, and a bulk accept-all / reject-all. Pure presentational and
   entity-agnostic — every action is a callback the caller wires to the engine
   (useSuggestions) + persistence. Hovering a card links to its inline widget in the
   editor through `onHover` (the caller reflects it back as the editor's hoveredChange).
   0 hardcoded color: accepted reads as accent, rejected/deleted as danger. */

export interface SuggestionPanelProps {
  changes: Suggestion[];
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  onFocus?: (id: string) => void;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: (id: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  title?: string;
}

export function SuggestionPanel({
  changes,
  hovered,
  onHover,
  onFocus,
  onAccept,
  onReject,
  onUndo,
  onAcceptAll,
  onRejectAll,
  title = "Suggestions",
}: SuggestionPanelProps) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pending = changes.filter((c) => c.status === "pending").length;
  const resolved = changes.length - pending;

  return (
    <aside className="nxSug" data-testid="suggestions-panel">
      <style>{SUG_CSS}</style>
      <div className="nxSug-head">
        <div className="nxSug-title"><MessageSquareText size={14} /> {title}</div>
        <div className="nxSug-sub">{pending} pending · {resolved} resolved · {changes.length} total</div>
        <div className="nxSug-prog"><span style={{ width: `${changes.length ? (resolved / changes.length) * 100 : 0}%` }} /></div>
        {pending > 0 && (
          <div className="nxSug-bulk">
            <button className="nxSug-bulk-b acc" data-testid="suggest-accept-all" onClick={onAcceptAll}><Check size={12} /> Accept all</button>
            <button className="nxSug-bulk-b rej" data-testid="suggest-reject-all" onClick={onRejectAll}><X size={12} /> Reject all</button>
          </div>
        )}
      </div>
      {changes.map((ch, i) => (
        <div
          key={ch.id}
          className={`nxSug-card is-${ch.status}${hovered === ch.id ? " is-hot" : ""}`}
          onMouseEnter={() => onHover?.(ch.id)}
          onMouseLeave={() => onHover?.(null)}
          onClick={() => onFocus?.(ch.id)}
          data-testid={`suggest-card-${ch.id}`}
        >
          <div className="nxSug-card-top">
            <span className="nxSug-n">{String(i + 1).padStart(2, "0")}</span>
            {ch.kind && <span className="nxSug-kind">{ch.kind}</span>}
          </div>
          <div className="nxSug-diff">
            <span className="nxSug-del">{ch.original}</span>
            <span className="nxSug-arrow">→</span>
            <span className="nxSug-ins">{ch.replacement}</span>
          </div>
          {ch.reason && (
            <div className={`nxSug-why${expanded.has(ch.id) ? " is-open" : ""}`}>{ch.reason}</div>
          )}
          {ch.reason && ch.reason.length > 120 && (
            <button className="nxSug-more" data-testid={`suggest-more-${ch.id}`} onClick={(e) => { e.stopPropagation(); toggle(ch.id); }}>
              {expanded.has(ch.id) ? "Show less" : "Show more"}
            </button>
          )}
          {ch.status === "pending" ? (
            <div className="nxSug-acts">
              <button className="nxSug-btn acc" data-testid={`suggest-accept-${ch.id}`} onClick={(e) => { e.stopPropagation(); onAccept(ch.id); }}><Check size={13} /> Accept</button>
              <button className="nxSug-btn rej" data-testid={`suggest-reject-${ch.id}`} onClick={(e) => { e.stopPropagation(); onReject(ch.id); }}><X size={13} /> Reject</button>
            </div>
          ) : (
            <div className="nxSug-verdict">
              <span className={`nxSug-vmark ${ch.status}`}>{ch.status === "accepted" ? <><Check size={12} /> accepted</> : <><X size={12} /> rejected</>}</span>
              <button className="nxSug-undo" data-testid={`suggest-undo-${ch.id}`} onClick={(e) => { e.stopPropagation(); onUndo(ch.id); }}><CornerUpLeft size={11} /> undo</button>
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}

const SUG_CSS = `
.nxSug{border-left:1px solid var(--nx-border);background:var(--nx-bg-sunken);align-self:start;
  max-height:calc(100vh - 52px);overflow-y:auto;animation:nxSugIn .26s var(--nx-ease-settle)}
@keyframes nxSugIn{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
.nxSug-head{padding:16px 18px 13px;border-bottom:1px solid var(--nx-border);position:sticky;top:0;background:var(--nx-bg-sunken);z-index:1}
.nxSug-title{display:flex;align-items:center;gap:8px;font:var(--nx-text-title);font-weight:700}
.nxSug-sub{font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);text-transform:uppercase;color:var(--nx-fg-muted);margin-top:6px}
.nxSug-prog{height:3px;background:var(--nx-border);margin-top:12px;overflow:hidden;border-radius:var(--nx-radius-s)}
.nxSug-prog span{display:block;height:100%;background:var(--nx-accent);transition:width .5s var(--nx-ease-settle)}
.nxSug-bulk{display:flex;gap:7px;margin-top:13px}
.nxSug-bulk-b{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;font:var(--nx-text-micro);
  letter-spacing:var(--nx-tracking-micro);text-transform:uppercase;padding:7px 8px;border:1px solid var(--nx-border);
  background:var(--nx-bg-raised);color:var(--nx-fg);cursor:pointer;border-radius:var(--nx-radius-s);transition:border-color var(--nx-t-fast),color var(--nx-t-fast),background var(--nx-t-fast)}
.nxSug-bulk-b.acc:hover{border-color:var(--nx-accent);color:var(--nx-accent);background:var(--nx-accent-soft)}
.nxSug-bulk-b.rej:hover{border-color:var(--nx-danger);color:var(--nx-danger);background:var(--nx-danger-soft)}
.nxSug-card{padding:15px 18px;border-bottom:1px solid var(--nx-border);cursor:pointer;position:relative;
  transition:background var(--nx-t-med),box-shadow var(--nx-t-med)}
.nxSug-card:hover,.nxSug-card.is-hot{background:var(--nx-bg-raised)}
.nxSug-card.is-hot{box-shadow:inset 3px 0 0 var(--nx-accent)}
.nxSug-card.is-rejected{opacity:.55}
.nxSug-card-top{display:flex;justify-content:space-between;gap:8px;font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);color:var(--nx-accent);margin-bottom:9px}
.nxSug-kind{color:var(--nx-fg-muted);text-transform:uppercase}
.nxSug-diff{font:var(--nx-text-body);line-height:1.5;margin-bottom:9px}
.nxSug-del{color:var(--nx-danger);text-decoration:line-through;text-decoration-color:var(--nx-danger);opacity:.75}
.nxSug-arrow{color:var(--nx-fg-muted);margin:0 5px;font-family:var(--nx-font-mono)}
.nxSug-ins{color:var(--nx-accent);font-weight:600}
.nxSug-why{font:var(--nx-text-meta);line-height:1.55;color:var(--nx-fg-muted);margin-bottom:10px;
  display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.nxSug-why.is-open{-webkit-line-clamp:unset;line-clamp:unset;overflow:visible}
.nxSug-more{background:none;border:0;color:var(--nx-accent);font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);
  text-transform:uppercase;cursor:pointer;padding:0;margin-bottom:12px}
.nxSug-more:hover{text-decoration:underline}
.nxSug-acts{display:flex;gap:7px}
.nxSug-btn{display:inline-flex;align-items:center;gap:5px;font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);
  text-transform:uppercase;padding:6px 11px;border:1px solid var(--nx-border);background:var(--nx-bg-raised);color:var(--nx-fg);
  cursor:pointer;border-radius:var(--nx-radius-s);transition:border-color var(--nx-t-fast),color var(--nx-t-fast),transform var(--nx-t-fast),background var(--nx-t-fast)}
.nxSug-btn:hover{transform:translateY(-1px)}
.nxSug-btn.acc:hover{border-color:var(--nx-accent);color:var(--nx-accent);background:var(--nx-accent-soft)}
.nxSug-btn.rej:hover{border-color:var(--nx-danger);color:var(--nx-danger);background:var(--nx-danger-soft)}
.nxSug-verdict{display:flex;align-items:center;gap:12px;font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro)}
.nxSug-vmark{display:inline-flex;align-items:center;gap:5px;text-transform:uppercase}
.nxSug-vmark.accepted{color:var(--nx-accent)}.nxSug-vmark.rejected{color:var(--nx-danger)}
.nxSug-undo{display:inline-flex;align-items:center;gap:4px;background:none;border:0;color:var(--nx-fg-muted);
  font:var(--nx-text-micro);letter-spacing:var(--nx-tracking-micro);text-transform:uppercase;cursor:pointer}
.nxSug-undo:hover{color:var(--nx-fg)}
@media (prefers-reduced-motion:reduce){.nxSug,.nxSug-prog span{animation:none;transition:none}}
`;
