/* Pure spherical geo-math for the map view's measure + area-filter tools — no
   browser, no maplibre, unit-testable under node:test. Great-circle distance
   (haversine), polyline length, spherical polygon area, and point containment
   (polygon by ray casting, circle by radius). Everything works in GeoJSON
   [lng, lat] order and metres, so the draw/measure readouts and the
   filter-by-drawn-area predicate share one tested core. */

export type LngLat = [number, number]; // [lng, lat] — GeoJSON order

/* IUGG mean Earth radius (metres) — the value turf and the Google spherical
   geometry library both use, so distances/areas line up with those references */
const R = 6371008.8;
const rad = (deg: number): number => (deg * Math.PI) / 180;

/* great-circle distance between two points, metres (haversine) */
export function haversine(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const lat1 = rad(a[1]);
  const lat2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* total length of a polyline, metres (0 for < 2 points) */
export function pathLength(pts: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
  return total;
}

/* absolute spherical polygon area, square metres. The ring auto-closes; the sign
   of the raw sum encodes winding, so the absolute value is orientation-free.
   Standard spherical-excess formula (turf/Google use the same). */
export function polygonArea(ring: LngLat[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % n];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

/* ray-casting point-in-polygon (planar test — accurate at map scales). The ring
   need not be closed; edges wrap the last vertex to the first. */
export function pointInPolygon(pt: LngLat, ring: LngLat[]): boolean {
  if (ring.length < 3) return false;
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const straddles = yi > y !== yj > y;
    if (straddles && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* within `radiusM` metres of `center` (inclusive) */
export function pointInCircle(pt: LngLat, center: LngLat, radiusM: number): boolean {
  return haversine(pt, center) <= radiusM;
}

/* a closed polygon ring approximating a geodesic circle — for drawing a radius
   shape (GL has no circle geometry) and its area outline. `steps` vertices. */
export function circleRing(center: LngLat, radiusM: number, steps = 64): LngLat[] {
  const [lng, lat] = center;
  const dLat = (radiusM / R) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos(rad(lat)));
  const ring: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return ring;
}

/* the centroid of a set of points ([0,0] when empty) — the map's add-point/route
   seeding uses it as a neutral anchor */
export function centroid(pts: LngLat[]): LngLat {
  if (pts.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

const nf = (n: number, digits = 0): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/* human distance: metres under 1 km, kilometres above (1 decimal) */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m)) return "—";
  if (m < 1000) return `${nf(Math.round(m))} m`;
  return `${nf(m / 1000, 1)} km`;
}

/* human area: m² under 0.1 km², km² above (2 decimals) */
export function formatArea(m2: number): string {
  if (!Number.isFinite(m2)) return "—";
  if (m2 < 100_000) return `${nf(Math.round(m2))} m²`;
  return `${nf(m2 / 1_000_000, 2)} km²`;
}

/* human duration from seconds: "12 min" / "1 h 20 min" */
export function formatDuration(s: number): string {
  if (!Number.isFinite(s)) return "—";
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
