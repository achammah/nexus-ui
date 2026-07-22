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

/* pins within this many px of the group anchor are treated as a colliding pile
   (≈ one pin width — genuine overlap, not merely "near") */
export const COLLISION_PX = 22;
/* arc length reserved per pin on the fan ring */
const RING_SPACING = 30;

/* group points by proximity to an ANCHOR (a point joins a group only if within
   collisionPx of the group's first point) — NOT transitive, so a dense field can't
   chain into one continent-wide mega-group; each group stays a tight local pile
   (diameter ≤ 2·collisionPx). Then fan each group of 2+ onto a ring. Points that
   aren't genuinely colliding are left in place (this fans same-spot piles; broad
   density is the clustering layer's job). */
export function spiderfyLayout(points: PixelPoint[], collisionPx = COLLISION_PX): Map<string, SpiderOffset> {
  const out = new Map<string, SpiderOffset>();
  const assigned = new Array(points.length).fill(false);

  for (let i = 0; i < points.length; i++) {
    if (assigned[i]) continue;
    const anchor = points[i];
    const group = [i];
    assigned[i] = true;
    // anchor-bounded: within collisionPx of the ANCHOR only
    for (let j = i + 1; j < points.length; j++) {
      if (assigned[j]) continue;
      if (Math.hypot(anchor.x - points[j].x, anchor.y - points[j].y) <= collisionPx) {
        group.push(j);
        assigned[j] = true;
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
