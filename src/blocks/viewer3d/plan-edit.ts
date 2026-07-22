/* Floor-plan EDITING math — immutable updates over the floorplan config. The
   apron's property inputs and the plan's direct manipulation both funnel through
   these, so an edit made by dragging and an edit typed into a field follow the
   same rules (snap, clamps, opening re-projection). All units meters. */

import type { Viewer3DFloorplanConfig, Viewer3DLevel, Viewer3DOpening, Viewer3DRoom } from "./scene";
import { openingsOnWall, polyBounds, type P2, type Wall } from "./plan-geometry";

export const SNAP = 0.05;             // grid snap for every geometric edit
export const MIN_ROOM = 0.6;          // a wall drag cannot shrink a room below this
export const MIN_OPENING = 0.4;

export const snap = (v: number): number => Math.round(v / SNAP) * SNAP;

const mapLevel = (
  fp: Viewer3DFloorplanConfig, levelId: string,
  f: (l: Viewer3DLevel) => Viewer3DLevel,
): Viewer3DFloorplanConfig => ({
  ...fp,
  levels: fp.levels.map((l) => (l.id === levelId ? f(l) : l)),
});

/* ---- rooms ---- */

export function patchRoom(
  fp: Viewer3DFloorplanConfig, levelId: string, roomId: string,
  patch: Partial<Pick<Viewer3DRoom, "label" | "roomType" | "finish" | "ceiling">>,
): Viewer3DFloorplanConfig {
  return mapLevel(fp, levelId, (l) => ({
    ...l,
    rooms: l.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)),
  }));
}

/* ---- openings ---- */

export function patchOpening(
  fp: Viewer3DFloorplanConfig, levelId: string, openingId: string,
  patch: Partial<Pick<Viewer3DOpening, "swing" | "sill" | "head" | "kind">>,
): Viewer3DFloorplanConfig {
  return mapLevel(fp, levelId, (l) => ({
    ...l,
    openings: (l.openings ?? []).map((o) => (o.id === openingId ? { ...o, ...patch } : o)),
  }));
}

/* resize an opening symmetrically about its center, staying on its wall line */
export function resizeOpening(
  fp: Viewer3DFloorplanConfig, levelId: string, openingId: string, width: number,
): Viewer3DFloorplanConfig {
  return mapLevel(fp, levelId, (l) => ({
    ...l,
    openings: (l.openings ?? []).map((o) => {
      if (o.id !== openingId) return o;
      const [a, b] = o.edge;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-6) return o;
      const w = Math.max(MIN_OPENING, snap(width));
      const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
      const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      return { ...o, edge: [[cx - ux * w / 2, cz - uz * w / 2], [cx + ux * w / 2, cz + uz * w / 2]] };
    }),
  }));
}

/* slide an opening ALONG its wall by delta meters (clamped into the wall span) */
export function slideOpening(
  fp: Viewer3DFloorplanConfig, levelId: string, openingId: string,
  wall: Wall, delta: number,
): Viewer3DFloorplanConfig {
  return mapLevel(fp, levelId, (l) => ({
    ...l,
    openings: (l.openings ?? []).map((o) => {
      if (o.id !== openingId) return o;
      const wallLen = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
      if (wallLen < 1e-6) return o;
      const ux = (wall.b[0] - wall.a[0]) / wallLen, uz = (wall.b[1] - wall.a[1]) / wallLen;
      const [a, b] = o.edge;
      const w = Math.hypot(b[0] - a[0], b[1] - a[1]);
      /* current start distance along the wall */
      const t0 = (a[0] - wall.a[0]) * ux + (a[1] - wall.a[1]) * uz;
      const next = Math.min(Math.max(snap(t0 + delta), 0.05), wallLen - w - 0.05);
      return {
        ...o,
        edge: [
          [wall.a[0] + ux * next, wall.a[1] + uz * next],
          [wall.a[0] + ux * (next + w), wall.a[1] + uz * (next + w)],
        ],
      };
    }),
  }));
}

/* ---- walls (axis-aligned only) ----
   Dragging a wall moves the shared line: every room vertex sitting on the wall's
   line WITHIN the wall's span shifts perpendicular, and openings riding the wall
   move with it. Clamped so no adjacent room collapses below MIN_ROOM. */

export function wallIsAxisAligned(wall: Wall): "x" | "z" | null {
  if (Math.abs(wall.a[0] - wall.b[0]) < 1e-6) return "x"; // vertical: constant x
  if (Math.abs(wall.a[1] - wall.b[1]) < 1e-6) return "z"; // horizontal: constant z
  return null;
}

export function moveWall(
  fp: Viewer3DFloorplanConfig, levelId: string, wall: Wall, delta: number,
): Viewer3DFloorplanConfig {
  const axis = wallIsAxisAligned(wall);
  if (!axis || Math.abs(delta) < 1e-9) return fp;
  const line = axis === "x" ? wall.a[0] : wall.a[1];
  const lo = axis === "x" ? Math.min(wall.a[1], wall.b[1]) : Math.min(wall.a[0], wall.b[0]);
  const hi = axis === "x" ? Math.max(wall.a[1], wall.b[1]) : Math.max(wall.a[0], wall.b[0]);
  const onWall = (p: P2): boolean => {
    const c = axis === "x" ? p[0] : p[1];
    const s = axis === "x" ? p[1] : p[0];
    return Math.abs(c - line) < 1e-4 && s >= lo - 1e-4 && s <= hi + 1e-4;
  };

  const level = fp.levels.find((l) => l.id === levelId);
  if (!level) return fp;

  /* clamp: for each room touching the wall, the move must keep its envelope */
  let d = snap(delta);
  for (const room of level.rooms) {
    if (!room.poly.some(onWall)) continue;
    const b = polyBounds([room.poly]);
    const [min, max] = axis === "x" ? [b.minX, b.maxX] : [b.minZ, b.maxZ];
    if (Math.abs(line - min) < 1e-4) {
      /* moving this room's LOW edge: room size = max - (line + d) */
      d = Math.min(d, max - MIN_ROOM - line);
    } else if (Math.abs(line - max) < 1e-4) {
      d = Math.max(d, min + MIN_ROOM - line);
    }
  }
  if (Math.abs(d) < 1e-9) return fp;

  const shift = (p: P2): P2 => (onWall(p) ? (axis === "x" ? [p[0] + d, p[1]] : [p[0], p[1] + d]) : p);
  return mapLevel(fp, levelId, (l) => ({
    ...l,
    rooms: l.rooms.map((r) => ({ ...r, poly: r.poly.map(shift) })),
    openings: (l.openings ?? []).map((o) => ({ ...o, edge: [shift(o.edge[0]), shift(o.edge[1])] as [P2, P2] })),
  }));
}

/* ---- lookups the apron needs ---- */

export function findOpening(level: Viewer3DLevel, id: string): Viewer3DOpening | undefined {
  return (level.openings ?? []).find((o) => o.id === id);
}

/* the wall an opening sits on (for slide clamps + the properties readout) */
export function wallOfOpening(walls: Wall[], level: Viewer3DLevel, openingId: string): Wall | undefined {
  return walls.find((w) => openingsOnWall(w, level.openings).some((x) => x.opening.id === openingId));
}
