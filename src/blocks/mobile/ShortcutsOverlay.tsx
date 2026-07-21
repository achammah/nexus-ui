import * as React from "react";
import { X } from "lucide-react";
import "./mobile.css";

/* ShortcutsOverlay — a keyboard-shortcuts help modal. Pure presentation: the host
   supplies the shortcut GROUPS (typically a "Core" group of shell shortcuts + an "App"
   group of config-driven ones) and owns the OPEN key; the overlay renders the reference
   and closes on Escape / `?` / backdrop / its close button. It claims Escape and `?`
   in the capture phase while mounted, so a host's own Escape ladders yield to it.
   Tokenized, both themes, reduced-motion aware. */

export interface ShortcutItem {
  /* the key caps in order; a literal "then" renders as a chord separator (g then a) */
  keys: string[];
  label: string;
}
export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}
export interface ShortcutsOverlayProps {
  groups: ShortcutGroup[];
  onClose: () => void;
  title?: string;
}

export function ShortcutsOverlay({ groups, onClose, title = "Keyboard shortcuts" }: ShortcutsOverlayProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "?") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    // capture: while the help is open it owns Escape/? above any host key ladder
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div
      className="nxShortcuts"
      data-testid="shortcuts-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="nxShortcuts-panel">
        <div className="nxShortcuts-head">
          <h2 className="nxShortcuts-title">{title}</h2>
          <button className="nxShortcuts-x" aria-label="Close" data-testid="shortcuts-close" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="nxShortcuts-groups">
          {groups.filter((g) => g.items.length > 0).map((g) => (
            <div className="nxShortcuts-group" key={g.title}>
              <span className="nxShortcuts-groupTitle">{g.title}</span>
              <div className="nxShortcuts-list">
                {g.items.map((s, i) => (
                  <div className="nxShortcuts-row" key={`${g.title}:${i}`}>
                    <span className="nxShortcuts-keys">
                      {s.keys.map((k, j) =>
                        k === "then"
                          ? <span className="nxShortcuts-then" key={j}>then</span>
                          : <kbd className="nxShortcuts-kbd" key={j}>{k}</kbd>,
                      )}
                    </span>
                    <span className="nxShortcuts-label">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
