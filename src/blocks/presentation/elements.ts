/* Element model helpers — pure functions over a slide's free-placement layer.
   Array order IS z-order (index 0 paints first / sits at the back), which keeps
   the model small and makes reordering a splice rather than an index rewrite. */

import type { ChartKind, ElementStyle, ShapeKind, Slide, SlideElement } from "./types";
import { uid } from "./types";

export const SLIDE_W = 1280;
export const SLIDE_H = 720;

export const els = (s: Slide): SlideElement[] => s.elements ?? [];
const withEls = (s: Slide, elements: SlideElement[]): Slide => ({ ...s, elements });

/* ---- creation ---- */

const SHAPE_DEFAULTS: ElementStyle = {
  fill: "var(--pres-accent)",
  stroke: "none",
  strokeWidth: 2,
  opacity: 1,
  radius: 16,
  color: "#ffffff",
  fontSize: 24,
  align: "center",
  valign: "middle",
};

const TEXT_DEFAULTS: ElementStyle = {
  fill: "none",
  stroke: "none",
  strokeWidth: 0,
  opacity: 1,
  color: "var(--pres-fg)",
  fontSize: 28,
  align: "left",
  valign: "top",
};

/* Line and arrow read as strokes, not filled boxes. */
const STROKE_SHAPES: ShapeKind[] = ["line", "arrow"];

export function createShape(shape: ShapeKind, at?: { x: number; y: number }): SlideElement {
  const stroked = STROKE_SHAPES.includes(shape);
  const w = stroked ? 320 : 280;
  const h = stroked ? 8 : 180;
  return {
    id: `el-${uid()}`,
    kind: "shape",
    shape,
    x: at?.x ?? Math.round((SLIDE_W - w) / 2),
    y: at?.y ?? Math.round((SLIDE_H - h) / 2),
    w,
    h,
    rot: 0,
    style: stroked
      ? { ...SHAPE_DEFAULTS, fill: "none", stroke: "var(--pres-accent)", strokeWidth: 6 }
      : { ...SHAPE_DEFAULTS },
  };
}

export function createTextBox(at?: { x: number; y: number }): SlideElement {
  return {
    id: `el-${uid()}`,
    kind: "text",
    x: at?.x ?? 200,
    y: at?.y ?? 300,
    w: 480,
    h: 120,
    rot: 0,
    html: "",
    style: { ...TEXT_DEFAULTS },
  };
}

export function createImageElement(src: string, at?: { x: number; y: number }): SlideElement {
  return {
    id: `el-${uid()}`,
    kind: "image",
    src,
    x: at?.x ?? 340,
    y: at?.y ?? 160,
    w: 600,
    h: 400,
    rot: 0,
    style: { opacity: 1, radius: 0 },
  };
}

export function createChart(type: ChartKind = "bar", at?: { x: number; y: number }): SlideElement {
  return {
    id: `el-${uid()}`,
    kind: "chart",
    x: at?.x ?? 190,
    y: at?.y ?? 170,
    w: 900,
    h: 420,
    rot: 0,
    style: { opacity: 1, fontSize: 13 },
    chart: {
      type,
      series: ["This year", "Last year"],
      rows: [
        { label: "Q1", values: [32, 24] },
        { label: "Q2", values: [41, 30] },
        { label: "Q3", values: [38, 33] },
        { label: "Q4", values: [52, 36] },
      ],
      showLegend: true,
      showGrid: true,
    },
  };
}

export function createTable(at?: { x: number; y: number }): SlideElement {
  const cell = (text: string) => ({ text });
  return {
    id: `el-${uid()}`,
    kind: "table",
    x: at?.x ?? 190,
    y: at?.y ?? 200,
    w: 900,
    h: 300,
    rot: 0,
    style: { opacity: 1, fontSize: 20, color: "var(--pres-fg)" },
    table: {
      headerRow: true,
      rows: [
        [cell("Metric"), cell("Q1"), cell("Q2"), cell("Change")],
        [cell("ARR"), cell("$3.6M"), cell("$4.2M"), cell("+18%")],
        [cell("NRR"), cell("109%"), cell("117%"), cell("+8pts")],
      ],
    },
  };
}

/* ---- mutation ---- */

export function addElement(s: Slide, el: SlideElement): Slide {
  return withEls(s, [...els(s), el]);
}

export function updateElement(s: Slide, id: string, patch: Partial<SlideElement>): Slide {
  return withEls(
    s,
    els(s).map((e) => (e.id === id ? { ...e, ...patch } : e)),
  );
}

export function updateStyle(s: Slide, ids: string[], patch: Partial<ElementStyle>): Slide {
  const set = new Set(ids);
  return withEls(
    s,
    els(s).map((e) => (set.has(e.id) ? { ...e, style: { ...e.style, ...patch } } : e)),
  );
}

export function removeElements(s: Slide, ids: string[]): Slide {
  const set = new Set(ids);
  return withEls(s, els(s).filter((e) => !set.has(e.id)));
}

export function duplicateElements(s: Slide, ids: string[]): { slide: Slide; newIds: string[] } {
  const set = new Set(ids);
  const copies: SlideElement[] = [];
  /* a duplicated GROUP stays one group — remap the id so it doesn't merge with the source */
  const groupRemap = new Map<string, string>();
  for (const e of els(s)) {
    if (!set.has(e.id)) continue;
    let groupId = e.groupId;
    if (groupId) {
      if (!groupRemap.has(groupId)) groupRemap.set(groupId, `grp-${uid()}`);
      groupId = groupRemap.get(groupId);
    }
    copies.push({ ...e, id: `el-${uid()}`, x: e.x + 24, y: e.y + 24, groupId });
  }
  return { slide: withEls(s, [...els(s), ...copies]), newIds: copies.map((c) => c.id) };
}

/* ---- z-order (array order) ---- */

export type ZOp = "front" | "back" | "forward" | "backward";

export function reorder(s: Slide, ids: string[], op: ZOp): Slide {
  const list = els(s);
  const set = new Set(ids);
  const moving = list.filter((e) => set.has(e.id));
  const rest = list.filter((e) => !set.has(e.id));
  if (!moving.length) return s;

  if (op === "front") return withEls(s, [...rest, ...moving]);
  if (op === "back") return withEls(s, [...moving, ...rest]);

  /* step one position, preserving relative order within the moving set */
  const next = list.slice();
  const idxs = next.map((e, i) => (set.has(e.id) ? i : -1)).filter((i) => i >= 0);
  const ordered = op === "forward" ? idxs.slice().reverse() : idxs;
  for (const i of ordered) {
    const j = op === "forward" ? i + 1 : i - 1;
    if (j < 0 || j >= next.length || set.has(next[j].id)) continue;
    const tmp = next[i];
    next[i] = next[j];
    next[j] = tmp;
  }
  return withEls(s, next);
}

/* ---- grouping ---- */

export function groupElements(s: Slide, ids: string[]): Slide {
  if (ids.length < 2) return s;
  const gid = `grp-${uid()}`;
  const set = new Set(ids);
  return withEls(
    s,
    els(s).map((e) => (set.has(e.id) ? { ...e, groupId: gid } : e)),
  );
}

export function ungroupElements(s: Slide, ids: string[]): Slide {
  const set = new Set(ids);
  return withEls(
    s,
    els(s).map((e) => {
      if (!set.has(e.id) || !e.groupId) return e;
      const { groupId: _drop, ...rest } = e;
      return rest as SlideElement;
    }),
  );
}

/* selecting one member of a group selects the whole group (PowerPoint behaviour) */
export function expandSelection(s: Slide, ids: string[]): string[] {
  const list = els(s);
  const groups = new Set(list.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId));
  if (!groups.size) return ids;
  const out = new Set(ids);
  for (const e of list) if (e.groupId && groups.has(e.groupId)) out.add(e.id);
  return list.filter((e) => out.has(e.id)).map((e) => e.id);
}

/* ---- geometry ---- */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const boundsOf = (list: SlideElement[]): Box | null => {
  if (!list.length) return null;
  const x = Math.min(...list.map((e) => e.x));
  const y = Math.min(...list.map((e) => e.y));
  const r = Math.max(...list.map((e) => e.x + e.w));
  const b = Math.max(...list.map((e) => e.y + e.h));
  return { x, y, w: r - x, h: b - y };
};

export const hitBox = (e: SlideElement): Box => ({ x: e.x, y: e.y, w: e.w, h: e.h });

/* ---- align + distribute ----
   One selected element aligns to the SLIDE; several align to their shared
   bounding box — the same rule PowerPoint and Slides use. */

export type AlignOp = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

export function alignElements(s: Slide, ids: string[], op: AlignOp): Slide {
  const list = els(s);
  const sel = list.filter((e) => ids.includes(e.id));
  if (!sel.length) return s;
  const b = sel.length === 1 ? { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H } : boundsOf(sel)!;
  const move = (e: SlideElement): SlideElement => {
    switch (op) {
      case "left":
        return { ...e, x: b.x };
      case "right":
        return { ...e, x: b.x + b.w - e.w };
      case "hcenter":
        return { ...e, x: Math.round(b.x + (b.w - e.w) / 2) };
      case "top":
        return { ...e, y: b.y };
      case "bottom":
        return { ...e, y: b.y + b.h - e.h };
      case "vcenter":
        return { ...e, y: Math.round(b.y + (b.h - e.h) / 2) };
    }
  };
  const set = new Set(ids);
  return withEls(s, list.map((e) => (set.has(e.id) ? move(e) : e)));
}

export function distributeElements(s: Slide, ids: string[], axis: "h" | "v"): Slide {
  const list = els(s);
  const sel = list.filter((e) => ids.includes(e.id));
  if (sel.length < 3) return s; // 2 items are already "evenly spaced"
  const key = axis === "h" ? "x" : "y";
  const size = axis === "h" ? "w" : "h";
  const sorted = sel.slice().sort((a, b) => a[key] - b[key]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = last[key] + last[size] - first[key];
  const used = sorted.reduce((n, e) => n + e[size], 0);
  const gap = (span - used) / (sorted.length - 1);
  let cursor = first[key];
  const moved = new Map<string, number>();
  for (const e of sorted) {
    moved.set(e.id, Math.round(cursor));
    cursor += e[size] + gap;
  }
  return withEls(
    s,
    list.map((e) => (moved.has(e.id) ? { ...e, [key]: moved.get(e.id)! } : e)),
  );
}

/* ---- snapping ----
   Candidate guides: slide edges + centre, and every non-moving element's edges +
   centre. Returns the adjusted delta plus the guide lines to draw. */

export interface Guide {
  axis: "x" | "y";
  at: number;
}

const SNAP_TOL = 6;

export function snapMove(
  moving: Box,
  others: SlideElement[],
  dx: number,
  dy: number,
): { dx: number; dy: number; guides: Guide[] } {
  const xs: number[] = [0, SLIDE_W / 2, SLIDE_W];
  const ys: number[] = [0, SLIDE_H / 2, SLIDE_H];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const guides: Guide[] = [];

  const fit = (edges: number[], candidates: number[]) => {
    let best: { delta: number; at: number } | null = null;
    for (const edge of edges) {
      for (const c of candidates) {
        const d = c - edge;
        if (Math.abs(d) <= SNAP_TOL && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, at: c };
      }
    }
    return best;
  };

  const px = moving.x + dx;
  const py = moving.y + dy;
  const sx = fit([px, px + moving.w / 2, px + moving.w], xs);
  const sy = fit([py, py + moving.h / 2, py + moving.h], ys);
  if (sx) {
    dx += sx.delta;
    guides.push({ axis: "x", at: sx.at });
  }
  if (sy) {
    dy += sy.delta;
    guides.push({ axis: "y", at: sy.at });
  }
  return { dx, dy, guides };
}

export const clampToSlide = (e: SlideElement): SlideElement => ({
  ...e,
  x: Math.round(Math.max(-e.w + 40, Math.min(SLIDE_W - 40, e.x))),
  y: Math.round(Math.max(-e.h + 40, Math.min(SLIDE_H - 40, e.y))),
  w: Math.max(8, Math.round(e.w)),
  h: Math.max(8, Math.round(e.h)),
});
