import * as React from "react";
import type { Slide, SlideElement } from "./types";
import {
  SLIDE_H,
  SLIDE_W,
  boundsOf,
  clampToSlide,
  els,
  expandSelection,
  snapMove,
  updateElement,
  type Guide,
} from "./elements";
import { ShapeSvg } from "./ShapeRender";
import { TableRender, setCell } from "./TableElement";
import { sanitizeHtml } from "./SlideView";

export interface ElementLayerProps {
  slide: Slide;
  editable?: boolean;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  /* mid-gesture updates — applied WITHOUT pushing history (one drag = one step) */
  onDraft?: (slide: Slide) => void;
  /* gesture end / discrete edit — pushes a history step */
  onCommit?: (slide: Slide) => void;
}

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface Drag {
  mode: "move" | "resize" | "rotate" | "marquee";
  handle?: Handle;
  startX: number;
  startY: number;
  origin: SlideElement[];
  originSlide: Slide;
  marquee?: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

/* rotate a vector by -deg (world delta -> element-local delta) */
const toLocal = (dx: number, dy: number, deg: number) => {
  const r = (-(deg || 0) * Math.PI) / 180;
  return { dx: dx * Math.cos(r) - dy * Math.sin(r), dy: dx * Math.sin(r) + dy * Math.cos(r) };
};
const toWorld = (dx: number, dy: number, deg: number) => {
  const r = ((deg || 0) * Math.PI) / 180;
  return { dx: dx * Math.cos(r) - dy * Math.sin(r), dy: dx * Math.sin(r) + dy * Math.cos(r) };
};

/* The free-placement layer. Sits inside the 1280x720 slide box with
   pointer-events:none, so empty space still reaches the layout regions
   underneath; only elements and handles capture the pointer. Marquee selection
   is bound to the slide root (the layer's parent) for the same reason. */
export function ElementLayer({ slide, editable, selected = [], onSelect, onDraft, onCommit }: ElementLayerProps) {
  const list = els(slide);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [guides, setGuides] = React.useState<Guide[]>([]);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  dragRef.current = drag;

  /* design-px per client-px, read live (FitSlide scales the whole box) */
  const scale = () => {
    const el = rootRef.current;
    if (!el) return 1;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? SLIDE_W / r.width : 1;
  };

  const selectedEls = list.filter((e) => selected.includes(e.id));
  const selBounds = boundsOf(selectedEls);

  /* ---- gesture start ---- */

  const startDrag = (e: React.PointerEvent, mode: Drag["mode"], handle?: Handle) => {
    if (!editable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = scale();
    setDrag({
      mode,
      handle,
      startX: e.clientX * k,
      startY: e.clientY * k,
      origin: list.filter((x) => selected.includes(x.id)),
      originSlide: slide,
      moved: false,
    });
  };

  const onElementPointerDown = (e: React.PointerEvent, el: SlideElement) => {
    if (!editable || el.locked) return;
    if (editingId === el.id) return; // typing inside the box
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let next: string[];
    if (additive) next = selected.includes(el.id) ? selected.filter((i) => i !== el.id) : [...selected, el.id];
    else next = selected.includes(el.id) ? selected : [el.id];
    next = expandSelection(slide, next);
    onSelect?.(next);
    /* start the move from the NEW selection, so a fresh click-drag moves immediately */
    if (!editable) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const k = scale();
    setDrag({
      mode: "move",
      startX: e.clientX * k,
      startY: e.clientY * k,
      origin: list.filter((x) => next.includes(x.id)),
      originSlide: slide,
      moved: false,
    });
  };

  /* marquee: bound to the slide root so it only fires on genuinely empty space */
  React.useEffect(() => {
    const layer = rootRef.current;
    const root = layer?.parentElement;
    if (!editable || !root) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest(".nxPresEl") || t.closest(".nxPresRegion") || t.closest(".nxPresElHandle")) return;
      const k = SLIDE_W / (layer!.getBoundingClientRect().width || SLIDE_W);
      onSelect?.([]);
      setEditingId(null);
      setDrag({
        mode: "marquee",
        startX: ev.clientX * k,
        startY: ev.clientY * k,
        origin: [],
        originSlide: slide,
        marquee: { x: 0, y: 0, w: 0, h: 0 },
        moved: false,
      });
    };
    root.addEventListener("pointerdown", onDown);
    return () => root.removeEventListener("pointerdown", onDown);
  }, [editable, slide, onSelect]);

  /* ---- gesture move/end (window-level so the pointer can leave the box) ---- */

  React.useEffect(() => {
    if (!drag) return;
    const layer = rootRef.current;

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || !layer) return;
      const k = SLIDE_W / (layer.getBoundingClientRect().width || SLIDE_W);
      const dx = ev.clientX * k - d.startX;
      const dy = ev.clientY * k - d.startY;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;

      if (d.mode === "marquee") {
        const r = layer.getBoundingClientRect();
        const ox = d.startX - r.left * k;
        const oy = d.startY - r.top * k;
        const box = { x: Math.min(ox, ox + dx), y: Math.min(oy, oy + dy), w: Math.abs(dx), h: Math.abs(dy) };
        setDrag({ ...d, marquee: box });
        return;
      }

      if (!d.origin.length) return;
      let next = d.originSlide;

      if (d.mode === "move") {
        const b = boundsOf(d.origin)!;
        const others = els(d.originSlide).filter((e) => !d.origin.some((o) => o.id === e.id));
        const snapped = ev.altKey ? { dx, dy, guides: [] as Guide[] } : snapMove(b, others, dx, dy);
        setGuides(snapped.guides);
        for (const o of d.origin) {
          next = updateElement(next, o.id, clampToSlide({ ...o, x: o.x + snapped.dx, y: o.y + snapped.dy }));
        }
      } else if (d.mode === "resize" && d.handle) {
        for (const o of d.origin) {
          const loc = toLocal(dx, dy, o.rot ?? 0);
          let { x, y, w, h } = o;
          const h4 = d.handle;
          if (h4.includes("e")) w = o.w + loc.dx;
          if (h4.includes("s")) h = o.h + loc.dy;
          if (h4.includes("w")) w = o.w - loc.dx;
          if (h4.includes("n")) h = o.h - loc.dy;
          if (ev.shiftKey && o.w > 0 && o.h > 0 && !["n", "s", "e", "w"].includes(h4)) {
            /* keep aspect on corner handles */
            const ratio = o.w / o.h;
            if (Math.abs(w - o.w) > Math.abs(h - o.h)) h = w / ratio;
            else w = h * ratio;
          }
          w = Math.max(16, w);
          h = Math.max(16, h);
          /* keep the opposite edge anchored, accounting for rotation */
          const growLocalX = h4.includes("w") ? -(w - o.w) : 0;
          const growLocalY = h4.includes("n") ? -(h - o.h) : 0;
          const world = toWorld(growLocalX, growLocalY, o.rot ?? 0);
          x = o.x + world.dx;
          y = o.y + world.dy;
          next = updateElement(next, o.id, clampToSlide({ ...o, x, y, w, h }));
        }
        setGuides([]);
      } else if (d.mode === "rotate") {
        const r = layer.getBoundingClientRect();
        for (const o of d.origin) {
          const cx = r.left + (o.x + o.w / 2) / k;
          const cy = r.top + (o.y + o.h / 2) / k;
          let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          next = updateElement(next, o.id, { ...o, rot: Math.round(deg) });
        }
        setGuides([]);
      }
      onDraft?.(next);
    };

    const up = (ev: PointerEvent) => {
      const d = dragRef.current;
      setGuides([]);
      if (!d) return;
      if (d.mode === "marquee") {
        const m = d.marquee;
        if (m && (m.w > 4 || m.h > 4)) {
          const hits = els(d.originSlide)
            .filter((e) => e.x < m.x + m.w && e.x + e.w > m.x && e.y < m.y + m.h && e.y + e.h > m.y)
            .map((e) => e.id);
          onSelect?.(expandSelection(d.originSlide, hits));
        }
        setDrag(null);
        return;
      }
      setDrag(null);
      /* a click that never moved is a selection, not an edit — no history step */
      if (d.moved) {
        const layerEl = rootRef.current;
        void layerEl;
        void ev;
        onCommit?.(currentRef.current);
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, onDraft, onCommit, onSelect]);

  /* the layer always commits the LATEST slide it rendered, not the one captured
     when the gesture started (drafts flow through the host and back down) */
  const currentRef = React.useRef(slide);
  currentRef.current = slide;

  /* ---- text editing inside an element ---- */
  const commitText = (id: string, html: string) => {
    onCommit?.(updateElement(currentRef.current, id, { html: sanitizeHtml(html) }));
  };

  const marquee = drag?.mode === "marquee" ? drag.marquee : null;

  return (
    <div
      ref={rootRef}
      className={`nxPresElLayer${editable ? " isEditable" : ""}`}
      style={{ width: SLIDE_W, height: SLIDE_H }}
      data-testid="element-layer"
    >
      {(() => {
        /* entrance-animation order = array order among the slide's animated elements */
        let animIdx = -1;
        return list.map((el) => {
        const isSel = selected.includes(el.id);
        const st = el.style ?? {};
        const animated = !editable && el.anim && el.anim.effect !== "none";
        if (animated) animIdx += 1;
        return (
          <div
            key={el.id}
            className={`nxPresEl nxPresEl-${el.kind}${isSel ? " isSelected" : ""}${el.locked ? " isLocked" : ""}`}
            data-el-id={el.id}
            data-anim={animated ? el.anim!.effect : undefined}
            style={{
              left: el.x,
              top: el.y,
              width: el.w,
              height: el.h,
              transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
              opacity: st.opacity ?? 1,
              ...(animated ? ({ "--anim-order": animIdx } as React.CSSProperties) : null),
            }}
            onPointerDown={(e) => onElementPointerDown(e, el)}
            onDoubleClick={() => {
              if (!editable || el.locked) return;
              if (el.kind === "text" || el.kind === "shape" || el.kind === "table") setEditingId(el.id);
            }}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={ariaFor(el)}
          >
            {el.kind === "shape" && <ShapeSvg el={el} />}
            {el.kind === "chart" && (
              <React.Suspense fallback={<div className="nxPresChartLoading">Chart…</div>}>
                <LazyChart el={el} />
              </React.Suspense>
            )}
            {el.kind === "table" && (
              <TableRender
                el={el}
                editable={editable && editingId === el.id}
                onCell={(r, c, text) => {
                  if (!el.table) return;
                  onCommit?.(updateElement(currentRef.current, el.id, { table: setCell(el.table, r, c, text) }));
                }}
              />
            )}
            {el.kind === "image" && (
              <img
                className="nxPresElImg"
                src={el.src}
                alt={el.alt ?? ""}
                style={{ borderRadius: st.radius ? `${st.radius}px` : undefined }}
                draggable={false}
              />
            )}
            {el.kind === "video" && (
              /* editor: inert (drag/resize like any element); present/viewer: real controls */
              <video
                className={`nxPresElVideo${editable ? " isInert" : ""}`}
                src={el.src}
                poster={el.poster}
                controls={!editable}
                playsInline
                preload="metadata"
                style={{ borderRadius: st.radius ? `${st.radius}px` : undefined }}
              />
            )}
            {(el.kind === "text" || el.kind === "shape") && (
              <ElementText
                el={el}
                editing={editingId === el.id}
                onDone={(html) => {
                  setEditingId(null);
                  commitText(el.id, html);
                }}
              />
            )}
          </div>
        );
        });
      })()}

      {/* selection chrome — one box per element, plus handles on the bounds */}
      {editable &&
        selectedEls.map((el) => (
          <div
            key={`sel-${el.id}`}
            className="nxPresElSel"
            style={{
              left: el.x,
              top: el.y,
              width: el.w,
              height: el.h,
              transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
            }}
          >
            {selectedEls.length === 1 && (
              <>
                <button
                  type="button"
                  className="nxPresElHandle nxPresElRot"
                  aria-label="Rotate element"
                  onPointerDown={(e) => startDrag(e, "rotate")}
                />
                {HANDLES.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`nxPresElHandle nxPresElH-${h}`}
                    aria-label={`Resize ${h}`}
                    onPointerDown={(e) => startDrag(e, "resize", h)}
                  />
                ))}
              </>
            )}
          </div>
        ))}

      {/* multi-select shows one shared bounding box (handles stay single-select, as in Slides) */}
      {editable && selectedEls.length > 1 && selBounds && (
        <div className="nxPresElMultiBounds" style={{ left: selBounds.x, top: selBounds.y, width: selBounds.w, height: selBounds.h }} />
      )}

      {guides.map((g, i) => (
        <div
          key={`g${i}`}
          className={`nxPresGuide nxPresGuide-${g.axis}`}
          style={g.axis === "x" ? { left: g.at, top: 0, height: SLIDE_H } : { top: g.at, left: 0, width: SLIDE_W }}
        />
      ))}

      {marquee && <div className="nxPresMarquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
    </div>
  );
}

function ariaFor(el: SlideElement): string {
  if (el.kind === "shape") return `${el.shape ?? "shape"} element`;
  if (el.kind === "image") return el.alt || "Image element";
  if (el.kind === "video") return "Video element";
  if (el.kind === "chart") return `${el.chart?.type ?? "bar"} chart`;
  if (el.kind === "table") return `Table, ${el.table?.rows.length ?? 0} rows`;
  return "Text box";
}

/* recharts is ~100 kB gz — a deck with no chart must not pay for it, so the
   renderer sits behind its own chunk and only loads when a chart is on screen. */
const LazyChart = React.lazy(() => import("./ChartElement"));

/* Text inside a text box or a shape label. Uncontrolled while editing (caret
   safety), seeded from the model otherwise — same contract as the layout regions. */
function ElementText({ el, editing, onDone }: { el: SlideElement; editing: boolean; onDone: (html: string) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const st = el.style ?? {};
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const clean = sanitizeHtml(el.html ?? "");
    if (node.innerHTML !== clean && !editing) node.innerHTML = clean;
  }, [el.html, editing]);
  React.useEffect(() => {
    if (!editing) return;
    const node = ref.current;
    node?.focus();
    const sel = window.getSelection();
    if (node && sel) {
      const r = document.createRange();
      r.selectNodeContents(node);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }, [editing]);

  const empty = !el.html || !el.html.replace(/<[^>]*>/g, "").trim();
  return (
    <div
      ref={ref}
      className={`nxPresElText${editing ? " isEditing" : ""}`}
      contentEditable={editing}
      suppressContentEditableWarning
      role={editing ? "textbox" : undefined}
      aria-multiline="true"
      data-placeholder={el.kind === "text" ? "Text box" : ""}
      data-empty={empty && !editing ? "1" : undefined}
      style={{
        color: st.color,
        fontSize: st.fontSize,
        fontFamily: st.fontFamily,
        textAlign: st.align,
        lineHeight: st.lineHeight,
        letterSpacing: st.letterSpacing != null ? `${st.letterSpacing}px` : undefined,
        justifyContent: st.valign === "middle" ? "center" : st.valign === "bottom" ? "flex-end" : "flex-start",
      }}
      onBlur={(e) => editing && onDone(e.currentTarget.innerHTML)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onDone(e.currentTarget.innerHTML);
        }
        e.stopPropagation(); // typing must not trigger slide-level shortcuts
      }}
      onPointerDown={(e) => editing && e.stopPropagation()}
    />
  );
}
