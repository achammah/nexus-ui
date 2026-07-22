/* Pure spiderfy layout for the map view's DOM markers — no browser, no maplibre,
   unit-testable. When individual pins (clustering off) pile onto the same spot,
   this fans each colliding group out onto a ring around the group's centroid so
   every pin is individually visible + clickable; a leader line (drawn by MapView)
   ties each spread pin back to its true location. Singletons keep a zero offset.
   Input is PIXEL positions (MapView projects lng/lat → screen and re-runs this on
   zoom/pan); output is a per-id pixel OFFSET applied as a CSS translate. */

export interface PixelPoint {
  id: string;
  x: number;
  y: number;
}

export interface SpiderOffset {
  dx: number;
  dy: number;
  /* true when the pin was moved off its true spot (draw a leader line) */
  spread: boolean;
}

/* pins within this many px of each other are treated as a colliding group */
export const COLLISION_PX = 26;
/* arc length reserved per pin on the fan ring */
const RING_SPACING = 34;

/* group points by proximity (transitive: a point joins a group if within
   collisionPx of ANY member), then fan each group of 2+ onto a ring. */
export function spiderfyLayout(points: PixelPoint[], collisionPx = COLLISION_PX): Map<string, SpiderOffset> {
  const out = new Map<string, SpiderOffset>();
  const assigned = new Array(points.length).fill(false);

  for (let i = 0; i < points.length; i++) {
    if (assigned[i]) continue;
    const group = [i];
    assigned[i] = true;
    // transitive expansion
    for (let g = 0; g < group.length; g++) {
      const a = points[group[g]];
      for (let j = 0; j < points.length; j++) {
        if (assigned[j]) continue;
        const b = points[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) <= collisionPx) {
          group.push(j);
          assigned[j] = true;
        }
      }
    }

    if (group.length === 1) {
      out.set(points[group[0]].id, { dx: 0, dy: 0, spread: false });
      continue;
    }

    // centroid of the colliding group
    let cx = 0;
    let cy = 0;
    for (const idx of group) {
      cx += points[idx].x;
      cy += points[idx].y;
    }
    cx /= group.length;
    cy /= group.length;

    const n = group.length;
    const radius = Math.max(collisionPx * 1.05, (RING_SPACING * n) / (2 * Math.PI));
    group.forEach((idx, k) => {
      const angle = (2 * Math.PI * k) / n - Math.PI / 2; // start at top, clockwise
      const tx = cx + radius * Math.cos(angle);
      const ty = cy + radius * Math.sin(angle);
      out.set(points[idx].id, { dx: tx - points[idx].x, dy: ty - points[idx].y, spread: true });
    });
  }

  return out;
}
