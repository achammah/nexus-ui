/* Floor-plan geometry + measurement math — pure functions, no three.js and no
   DOM. Everything the 2D technical drawing, the room schedule and the 3D wall
   builder agree on lives here, so a measurement printed on the plan and a wall
   cut in 3D can never disagree. All inputs are meters in plan (x, z) space. */

import type { Viewer3DLevel, Viewer3DOpening, Viewer3DRoom, Viewer3DUnits } from "./scene";

export type P2 = [number, number];

const EPS = 1e-4;

/* ---- polygon measures ---- */

/* shoelace area (m²), sign-independent */
export function polyArea(poly: P2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return Math.abs(a) / 2;
}

export function polyBounds(polys: P2[][]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const poly of polys) for (const [x, z] of poly) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function polyCentroid(poly: P2[]): P2 {
  let x = 0, z = 0;
  for (const [px, pz] of poly) { x += px; z += pz; }
  return [x / poly.length, z / poly.length];
}

/* a room's overall envelope, W (x) × D (z) */
export function roomDims(room: Viewer3DRoom): { w: number; d: number } {
  const b = polyBounds([room.poly]);
  return { w: b.maxX - b.minX, d: b.maxZ - b.minZ };
}

/* ---- wall extraction ----
   Rooms are drawn as closed polygons; adjacent rooms repeat their shared edge.
   Collapsing duplicates gives each wall ONCE, tagged interior (shared) or
   exterior (single occurrence) — the plan draws exterior walls thicker and the
   dimension chains hang off the exterior outline. */

export interface Wall {
  a: P2;
  b: P2;
  shared: boolean;          // interior partition (two rooms) vs exterior
  rooms: string[];          // room ids on this wall
}

const key = ([x, z]: P2): string => `${Math.round(x * 1000)},${Math.round(z * 1000)}`;
const segKey = (a: P2, b: P2): string => {
  const ka = key(a), kb = key(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export function levelWalls(level: Viewer3DLevel): Wall[] {
  const map = new Map<string, Wall>();
  for (const room of level.rooms) {
    const n = room.poly.length;
    for (let i = 0; i < n; i++) {
      const a = room.poly[i], b = room.poly[(i + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < EPS) continue;
      const k = segKey(a, b);
      const hit = map.get(k);
      if (hit) { hit.shared = true; hit.rooms.push(room.id); }
      else map.set(k, { a, b, shared: false, rooms: [room.id] });
    }
  }
  return [...map.values()];
}

/* ---- openings on a wall ----
   An opening's edge must be colinear with and inside a wall segment; it is
   returned as a [t0, t1] span along the wall (t in 0..1 from wall.a). */

export interface WallOpening {
  opening: Viewer3DOpening;
  t0: number;
  t1: number;
}

function projectT(a: P2, b: P2, p: P2): number | null {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  if (len2 < EPS) return null;
  /* colinearity: cross product ~ 0 */
  const cross = dx * (p[1] - a[1]) - dz * (p[0] - a[0]);
  if (Math.abs(cross) / Math.sqrt(len2) > 0.02) return null;
  return (dx * (p[0] - a[0]) + dz * (p[1] - a[1])) / len2;
}

export function openingsOnWall(wall: Wall, openings: Viewer3DOpening[] | undefined): WallOpening[] {
  if (!openings) return [];
  const out: WallOpening[] = [];
  for (const op of openings) {
    const ta = projectT(wall.a, wall.b, op.edge[0]);
    const tb = projectT(wall.a, wall.b, op.edge[1]);
    if (ta === null || tb === null) continue;
    const t0 = Math.min(ta, tb), t1 = Math.max(ta, tb);
    if (t1 < -EPS || t0 > 1 + EPS || t1 - t0 < EPS) continue;
    out.push({ opening: op, t0: Math.max(0, t0), t1: Math.min(1, t1) });
  }
  return out.sort((x, y) => x.t0 - y.t0);
}

/* solid wall spans left after cutting the openings out, as [t0, t1] pairs */
export function solidSpans(ops: WallOpening[]): [number, number][] {
  const out: [number, number][] = [];
  let cur = 0;
  for (const o of ops) {
    if (o.t0 - cur > EPS) out.push([cur, o.t0]);
    cur = Math.max(cur, o.t1);
  }
  if (1 - cur > EPS) out.push([cur, 1]);
  return out;
}

export const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* ---- dimension chains ----
   For orthogonal plans, the classic architect chain dims read off the plan's
   structural grid: the sorted unique X (and Z) coordinates of the room corners.
   Non-orthogonal geometry simply contributes its bbox stops. */

export function gridStops(level: Viewer3DLevel): { xs: number[]; zs: number[] } {
  const xs = new Set<number>(), zs = new Set<number>();
  for (const room of level.rooms) for (const [x, z] of room.poly) {
    xs.add(Math.round(x * 1000) / 1000);
    zs.add(Math.round(z * 1000) / 1000);
  }
  return { xs: [...xs].sort((a, b) => a - b), zs: [...zs].sort((a, b) => a - b) };
}

/* ---- level / plan totals ---- */

export function levelArea(level: Viewer3DLevel): number {
  return level.rooms.reduce((s, r) => s + polyArea(r.poly), 0);
}

/* ---- unit formatting ---- */

const FT = 3.28084;

/* "4.40 m" / "14'-5"" — lengths on dimension lines and labels */
export function formatLen(m: number, units: Viewer3DUnits): string {
  if (units === "imperial") {
    const totalIn = m * FT * 12;
    const ft = Math.floor(totalIn / 12);
    const inch = Math.round(totalIn - ft * 12);
    return inch === 12 ? `${ft + 1}'-0"` : `${ft}'-${inch}"`;
  }
  return `${m.toFixed(2)} m`;
}

/* dimension-line text: metric plans conventionally label millimeters */
export function formatDim(m: number, units: Viewer3DUnits): string {
  if (units === "imperial") return formatLen(m, units);
  return String(Math.round(m * 1000));
}

export function formatArea(m2: number, units: Viewer3DUnits): string {
  if (units === "imperial") return `${(m2 * FT * FT).toFixed(0)} ft²`;
  return `${m2.toFixed(1)} m²`;
}

/* nearest standard architectural scale for a px-per-meter density, assuming CSS
   96 dpi — printed on the title block when meta.scale is not supplied */
export function nearestScale(pxPerM: number): string {
  const mPerPx = 1 / pxPerM;
  const denom = mPerPx * (96 / 0.0254); // meters drawn per meter of screen
  const standards = [20, 25, 50, 75, 100, 125, 200, 250, 500];
  let best = standards[0];
  for (const s of standards) if (Math.abs(s - denom) < Math.abs(best - denom)) best = s;
  return `1:${best}`;
}

/* a nice scale-bar length (m) for the drawing width: 1/2/5×10^k covering ~1/5 of it */
export function scaleBarLength(drawingWidthM: number): number {
  const target = drawingWidthM / 5;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 0.1))));
  for (const mul of [5, 2, 1]) if (mul * pow <= target) return mul * pow;
  return pow;
}
