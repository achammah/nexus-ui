/* Boolean / shape-combination geometry for the whiteboard.

   HONEST SCOPE — excalidraw ships NO native boolean operation. This module is a real
   geometry layer (polygon-clipping, the Martinez algorithm behind Turf) over the
   CLOSED shapes excalidraw can represent: rectangle, ellipse, diamond, and a closed
   line/freedraw polygon. Curved shapes (ellipse) are polygonised to a fine N-gon —
   an approximation, disclosed. Output is a filled, closed `line` element (the only
   excalidraw primitive that fills an arbitrary polygon). Holes (e.g. subtract fully
   inside) are emitted as separate outline rings — excalidraw cannot render a cut-out
   fill, flagged. Arrows, text, images and open strokes are not eligible.

   Pure + node-testable: takes elements, returns element SKELETONS (the caller runs
   convertToExcalidrawElements in the browser). Imports polygon-clipping only. */

import * as polygonClippingNS from "polygon-clipping";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";
import type { SceneElementLike } from "./scene";

/* polygon-clipping ships as CJS (module.exports = { union, ... }); the interop shape
   differs across bundlers/loaders (namespace vs default), so bind through whichever
   carries the functions. Typed explicitly so the callers stay type-safe. */
type ClipFn = (geom: Polygon | MultiPolygon, ...geoms: (Polygon | MultiPolygon)[]) => MultiPolygon;
interface ClipLib {
  union: ClipFn;
  intersection: ClipFn;
  xor: ClipFn;
  difference: ClipFn;
}
const clip: ClipLib = (() => {
  const ns = polygonClippingNS as unknown as { default?: ClipLib } & ClipLib;
  return typeof ns.union === "function" ? ns : (ns.default as ClipLib);
})();

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";
export const BOOLEAN_OPS: BooleanOp[] = ["union", "subtract", "intersect", "exclude"];

/* shape types we can turn into a polygon ring */
const CLOSED_TYPES = new Set(["rectangle", "ellipse", "diamond", "line", "freedraw"]);

export const isBooleanEligible = (e: SceneElementLike): boolean => {
  const t = e.type as string;
  if (!CLOSED_TYPES.has(t)) return false;
  if (t === "line" || t === "freedraw") {
    const pts = (e as { points?: unknown }).points;
    return Array.isArray(pts) && pts.length >= 3; // needs enough points to close
  }
  const w = Number((e as { width?: number }).width) || 0;
  const h = Number((e as { height?: number }).height) || 0;
  return w > 0 && h > 0;
};

/* a selected element that already carries a boolean/joined result → can be split */
export const isSplittable = (e: SceneElementLike): boolean =>
  !!(e.customData as { nxRings?: unknown } | undefined)?.nxRings;

function rotate(px: number, py: number, cx: number, cy: number, angle: number): [number, number] {
  if (!angle) return [px, py];
  const s = Math.sin(angle), c = Math.cos(angle);
  const dx = px - cx, dy = py - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}

/* one element → an outer ring in absolute scene coords (honouring rotation) */
export function elementToRing(e: SceneElementLike): [number, number][] | null {
  const t = e.type as string;
  const x = Number(e.x) || 0, y = Number(e.y) || 0;
  const w = Number((e as { width?: number }).width) || 0;
  const h = Number((e as { height?: number }).height) || 0;
  const angle = Number((e as { angle?: number }).angle) || 0;
  const cx = x + w / 2, cy = y + h / 2;
  let pts: [number, number][] = [];
  if (t === "rectangle") {
    pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  } else if (t === "diamond") {
    pts = [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  } else if (t === "ellipse") {
    const N = 64, rx = w / 2, ry = h / 2;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
  } else if (t === "line" || t === "freedraw") {
    const raw = (e as { points?: [number, number][] }).points ?? [];
    pts = raw.map(([dx, dy]) => [x + dx, y + dy]);
  } else {
    return null;
  }
  if (pts.length < 3) return null;
  const rotated = pts.map(([px, py]) => rotate(px, py, cx, cy, angle));
  // close the ring (polygon-clipping tolerates open, but be explicit)
  const [fx, fy] = rotated[0];
  const [lx, ly] = rotated[rotated.length - 1];
  if (fx !== lx || fy !== ly) rotated.push([fx, fy]);
  return rotated;
}

const asPolygon = (ring: [number, number][]): Polygon => [ring as unknown as Ring];

/* style fields a boolean result inherits from its base element */
function styleOf(e: SceneElementLike) {
  return {
    strokeColor: (e.strokeColor as string) ?? "#1e1e1e",
    backgroundColor: (e.backgroundColor as string) ?? "transparent",
    fillStyle: (e.fillStyle as string) ?? "solid",
    strokeWidth: (e.strokeWidth as number) ?? 2,
    strokeStyle: (e.strokeStyle as string) ?? "solid",
    roughness: (e.roughness as number) ?? 1,
    opacity: (e.opacity as number) ?? 100,
  };
}

/* a closed-line skeleton for one ring (absolute coords → x + relative points).
   width/height are passed explicitly — convertToExcalidrawElements does NOT derive a
   line's dimensions from its points (it defaults them), so an omitted size renders a
   degenerate/invisible element. */
function ringToSkeleton(ring: number[][], style: ReturnType<typeof styleOf>, filled: boolean, tag?: unknown) {
  const x = ring[0][0], y = ring[0][1];
  const points = ring.map(([px, py]) => [px - x, py - y] as [number, number]);
  const dxs = points.map((p) => p[0]), dys = points.map((p) => p[1]);
  const width = Math.max(...dxs) - Math.min(...dxs);
  const height = Math.max(...dys) - Math.min(...dys);
  return {
    type: "line" as const,
    x,
    y,
    width,
    height,
    points,
    strokeColor: style.strokeColor,
    backgroundColor: filled ? style.backgroundColor : "transparent",
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    opacity: style.opacity,
    ...(tag ? { customData: { nxRings: tag } } : {}),
  };
}

export interface BooleanResult {
  /* element skeletons to add (convertToExcalidrawElements in the caller) */
  skeletons: Record<string, unknown>[];
  /* ids of the source elements to remove */
  removeIds: string[];
  /* honest note when the geometry could not be fully represented */
  note?: string;
}

/* Apply a boolean op to the eligible selected elements. Returns the skeletons to
   insert and the source ids to delete. `subtract` uses the lowest element (first in
   the passed order — caller passes z-sorted) as the base minus the rest. */
export function applyBoolean(op: BooleanOp, elements: SceneElementLike[]): BooleanResult | { error: string } {
  const eligible = elements.filter(isBooleanEligible);
  if (eligible.length < 2) return { error: "Select at least two closed shapes (rectangle, ellipse, diamond, or a closed line)." };
  const rings = eligible.map(elementToRing).filter((r): r is [number, number][] => !!r);
  if (rings.length < 2) return { error: "The selected shapes could not be converted to polygons." };
  const polys: Polygon[] = rings.map(asPolygon);

  let out: MultiPolygon;
  try {
    if (op === "union") out = clip.union(polys[0], ...polys.slice(1));
    else if (op === "intersect") out = clip.intersection(polys[0], ...polys.slice(1));
    else if (op === "exclude") out = clip.xor(polys[0], ...polys.slice(1));
    else out = clip.difference(polys[0], ...polys.slice(1));
  } catch (e) {
    return { error: `The shapes could not be combined (${(e as Error).message}).` };
  }
  if (!out || out.length === 0) {
    return { error: op === "intersect" ? "The shapes do not overlap — nothing to intersect." : "The operation produced an empty result." };
  }

  const style = styleOf(eligible[0]);
  const skeletons: Record<string, unknown>[] = [];
  let hadHoles = false;
  // tag rings so a later Split can recover the pieces
  const allRings: number[][][] = [];
  for (const poly of out) {
    for (let i = 0; i < poly.length; i++) allRings.push(poly[i] as unknown as number[][]);
  }
  for (const poly of out) {
    // outer ring filled; inner rings (holes) as outline only (excalidraw cannot cut a fill)
    skeletons.push(ringToSkeleton(poly[0] as unknown as number[][], style, true, allRings.length > 1 ? allRings : undefined));
    for (let i = 1; i < poly.length; i++) {
      hadHoles = true;
      skeletons.push(ringToSkeleton(poly[i] as unknown as number[][], style, false));
    }
  }
  return {
    skeletons,
    removeIds: eligible.map((e) => e.id),
    note: hadHoles ? "The result has a hole — excalidraw cannot cut a filled shape, so the cut-out is drawn as an outline." : undefined,
  };
}

/* Split a boolean/joined result back into its constituent rings. */
export function splitElement(e: SceneElementLike): BooleanResult | { error: string } {
  const tag = (e.customData as { nxRings?: number[][][] } | undefined)?.nxRings;
  if (!tag || tag.length < 2) return { error: "This shape has no combined pieces to split." };
  const style = styleOf(e);
  return {
    skeletons: tag.map((ring) => ringToSkeleton(ring, style, true)),
    removeIds: [e.id],
  };
}
