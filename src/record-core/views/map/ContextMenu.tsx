import * as React from "react";

/* Right-click context menu for the map — Google-Maps style. MapView owns the
   target (cursor lng/lat, whether a record was hit) and builds the item list;
   this component just positions + renders it, with click-away + Escape + focus
   management. Token-styled (map.css), keyboard-navigable. */

export interface ContextItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  sub?: string; // e.g. the resolved "what's here" label under the action
}

export function MapContextMenu({
  style,
  items,
  onClose,
}: {
  style: React.CSSProperties;
  items: ContextItem[];
  onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
  }, []);
  return (
    <>
      <button type="button" className="nxMapBackdrop" aria-hidden tabIndex={-1} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="nxMapContextMenu"
        role="menu"
        aria-label="Map actions"
        data-testid="map-context-menu"
        style={style}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="menuitem"
            className="nxMapContextItem"
            data-testid={`map-ctx-${it.id}`}
            disabled={it.disabled}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
          >
            <span className="nxMapContextIcon" aria-hidden>
              {it.icon}
            </span>
            <span className="nxMapContextLabel">
              {it.label}
              {it.sub && <span className="nxMapContextSub">{it.sub}</span>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
