import * as React from "react";
import type { ShapeKind, Slide, SlideElement } from "./types";
import {
  alignElements,
  distributeElements,
  els,
  groupElements,
  reorder,
  ungroupElements,
  updateStyle,
  type AlignOp,
  type ZOp,
} from "./elements";
import { SHAPE_LABELS, ShapeGlyph } from "./ShapeRender";

const SHAPES: ShapeKind[] = ["rect", "roundRect", "ellipse", "triangle", "arrow", "line", "star", "callout"];

/* ---- insert ---- */

export function InsertBar({
  onInsertShape,
  onInsertText,
  onInsertImage,
  extra,
}: {
  onInsertShape: (s: ShapeKind) => void;
  onInsertText: () => void;
  onInsertImage: () => void;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div className="nxPresToolGroup" ref={ref}>
      <button type="button" className="nxPresToolBtn" onClick={onInsertText} title="Insert a text box" data-testid="insert-text">
        Text box
      </button>
      <div className="nxPresMenuWrap">
        <button
          type="button"
          className={`nxPresToolBtn${open ? " isOn" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          data-testid="insert-shape-menu"
        >
          Shape ▾
        </button>
        {open && (
          <div className="nxPresMenu" role="menu" aria-label="Insert shape">
            {SHAPES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                className="nxPresMenuItem"
                data-testid={`insert-shape-${s}`}
                onClick={() => {
                  onInsertShape(s);
                  setOpen(false);
                }}
              >
                <ShapeGlyph shape={s} />
                <span>{SHAPE_LABELS[s]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="nxPresToolBtn" onClick={onInsertImage} title="Insert an image" data-testid="insert-image">
        Image
      </button>
      {extra}
    </div>
  );
}

/* ---- selected-element properties ---- */

const SWATCHES = [
  "var(--pres-accent)",
  "var(--pres-fg)",
  "#ffffff",
  "#0f172a",
  "#e5484d",
  "#f5a524",
  "#30a46c",
  "#3b82f6",
  "none",
];

export function ElementBar({
  slide,
  selected,
  onSlide,
  onSelect,
}: {
  slide: Slide;
  selected: string[];
  onSlide: (s: Slide) => void;
  onSelect: (ids: string[]) => void;
}) {
  const list = els(slide);
  const sel = list.filter((e) => selected.includes(e.id));
  if (!sel.length) return null;
  const first: SlideElement = sel[0];
  const st = first.style ?? {};
  const many = sel.length > 1;
  const grouped = sel.some((e) => e.groupId);
  const hasShape = sel.some((e) => e.kind === "shape");
  const hasText = sel.some((e) => e.kind === "text" || e.kind === "shape");

  const style = (patch: Parameters<typeof updateStyle>[2]) => onSlide(updateStyle(slide, selected, patch));
  const z = (op: ZOp) => onSlide(reorder(slide, selected, op));
  const align = (op: AlignOp) => onSlide(alignElements(slide, selected, op));

  return (
    <div className="nxPresElBar" role="toolbar" aria-label="Element properties" data-testid="element-bar">
      <span className="nxPresElBarCount">{many ? `${sel.length} selected` : labelOf(first)}</span>

      {(hasShape || first.kind === "text") && (
        <ColorWell
          label="Fill"
          value={st.fill ?? "none"}
          onPick={(v) => style({ fill: v })}
          testid="fill-well"
        />
      )}
      {hasShape && (
        <ColorWell label="Line" value={st.stroke ?? "none"} onPick={(v) => style({ stroke: v })} testid="stroke-well" />
      )}
      {hasText && <ColorWell label="Text" value={st.color ?? "var(--pres-fg)"} onPick={(v) => style({ color: v })} testid="color-well" />}

      {hasShape && (
        <label className="nxPresToolLabel">
          Line w
          <input
            className="nxPresNum"
            type="number"
            min={0}
            max={40}
            value={st.strokeWidth ?? 0}
            onChange={(e) => style({ strokeWidth: Number(e.target.value) })}
            aria-label="Line width"
          />
        </label>
      )}
      <label className="nxPresToolLabel">
        {hasShape ? "Fill α" : "Opacity"}
        <input
          className="nxPresRange"
          type="range"
          min={0}
          max={100}
          value={Math.round((hasShape ? st.fillOpacity ?? 1 : st.opacity ?? 1) * 100)}
          onChange={(e) =>
            style(hasShape ? { fillOpacity: Number(e.target.value) / 100 } : { opacity: Number(e.target.value) / 100 })
          }
          aria-label={hasShape ? "Fill opacity" : "Opacity"}
          data-testid="opacity-range"
        />
      </label>
      {(first.shape === "roundRect" || first.kind === "image") && (
        <label className="nxPresToolLabel">
          Radius
          <input
            className="nxPresNum"
            type="number"
            min={0}
            max={200}
            value={st.radius ?? 0}
            onChange={(e) => style({ radius: Number(e.target.value) })}
            aria-label="Corner radius"
          />
        </label>
      )}
      {hasText && (
        <label className="nxPresToolLabel">
          Size
          <input
            className="nxPresNum"
            type="number"
            min={8}
            max={200}
            value={st.fontSize ?? 24}
            onChange={(e) => style({ fontSize: Number(e.target.value) })}
            aria-label="Font size"
          />
        </label>
      )}

      <div className="nxPresElBarSep" />
      <button type="button" className="nxPresToolBtn" onClick={() => z("front")} title="Bring to front" data-testid="z-front">⤒</button>
      <button type="button" className="nxPresToolBtn" onClick={() => z("forward")} title="Bring forward">↑</button>
      <button type="button" className="nxPresToolBtn" onClick={() => z("backward")} title="Send backward">↓</button>
      <button type="button" className="nxPresToolBtn" onClick={() => z("back")} title="Send to back" data-testid="z-back">⤓</button>

      <div className="nxPresElBarSep" />
      <button type="button" className="nxPresToolBtn" onClick={() => align("left")} title="Align left" data-testid="align-left">⇤</button>
      <button type="button" className="nxPresToolBtn" onClick={() => align("hcenter")} title="Align centre">↔</button>
      <button type="button" className="nxPresToolBtn" onClick={() => align("right")} title="Align right">⇥</button>
      <button type="button" className="nxPresToolBtn" onClick={() => align("top")} title="Align top">⤒</button>
      <button type="button" className="nxPresToolBtn" onClick={() => align("vcenter")} title="Align middle">↕</button>
      <button type="button" className="nxPresToolBtn" onClick={() => align("bottom")} title="Align bottom">⤓</button>
      {sel.length > 2 && (
        <>
          <button type="button" className="nxPresToolBtn" onClick={() => onSlide(distributeElements(slide, selected, "h"))} title="Distribute horizontally" data-testid="dist-h">
            ⇹
          </button>
          <button type="button" className="nxPresToolBtn" onClick={() => onSlide(distributeElements(slide, selected, "v"))} title="Distribute vertically">
            ⇵
          </button>
        </>
      )}

      {(many || grouped) && (
        <>
          <div className="nxPresElBarSep" />
          {grouped ? (
            <button type="button" className="nxPresToolBtn" onClick={() => onSlide(ungroupElements(slide, selected))} data-testid="ungroup-btn">
              Ungroup
            </button>
          ) : (
            <button type="button" className="nxPresToolBtn" onClick={() => onSlide(groupElements(slide, selected))} data-testid="group-btn">
              Group
            </button>
          )}
        </>
      )}

      <div className="nxPresElBarSep" />
      <button
        type="button"
        className="nxPresToolBtn nxPresToolDanger"
        onClick={() => {
          onSlide({ ...slide, elements: list.filter((e) => !selected.includes(e.id)) });
          onSelect([]);
        }}
        title="Delete element"
        data-testid="el-delete"
      >
        Delete
      </button>
    </div>
  );
}

const labelOf = (e: SlideElement): string =>
  e.kind === "shape" ? SHAPE_LABELS[e.shape ?? "rect"] : e.kind === "image" ? "Image" : "Text box";

function ColorWell({
  label,
  value,
  onPick,
  testid,
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
  testid?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  return (
    <div className="nxPresMenuWrap" ref={ref}>
      <button
        type="button"
        className="nxPresColorWell"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${label} colour`}
        aria-expanded={open}
        data-testid={testid}
      >
        <span className="nxPresColorWellLabel">{label}</span>
        <span className={`nxPresColorChip${value === "none" ? " isNone" : ""}`} style={{ background: value === "none" ? undefined : value }} />
      </button>
      {open && (
        <div className="nxPresMenu nxPresSwatches" role="menu" aria-label={`${label} colour`}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              className={`nxPresSwatch${c === "none" ? " isNone" : ""}`}
              style={{ background: c === "none" ? undefined : c }}
              aria-label={c === "none" ? "No colour" : c}
              data-testid={`swatch-${c.replace(/[^a-z0-9]/gi, "")}`}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
