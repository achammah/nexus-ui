import type { LngLat } from "./geomath";
import { haversine } from "./geomath";

/* Geocoding SEAM for the map view (forward search + reverse "what's here?").
   ─────────────────────────────────────────────────────────────────────────────
   ⚑ FLAGGED SEAM. Address geocoding needs an external provider (Nominatim/OSM,
   Mapbox, Google, …) — each with a key and/or a usage policy. NONE is hardcoded
   here (no key can leak, no blocked host). This module defines the provider
   INTERFACE and ships a deterministic LOCAL MOCK that works offline / in CI and
   returns the REAL payload SHAPE, so search-and-geocode and reverse-geocode are
   wired end-to-end against a contract a real provider drops straight into.

   To wire a real provider: set `geocodeEndpoint` in the view config to an APP route
   that proxies the keyed vendor SERVER-SIDE (forward: `?q=`; reverse: `?lat=&lon=`)
   and returns the shapes below. Leave it unset and the local mock runs. Turn-by-turn
   ROUTING lives in routing.ts. See docs/RECIPES.md "Give an object a map view". */

export interface GeocodeResult {
  label: string; // display name
  lng: number;
  lat: number;
  /* [minLng, minLat, maxLng, maxLat] — real providers return it; the map fits to
     it when present, else flies to the point */
  bbox?: [number, number, number, number];
  /* the mock marks its results so the UI can label them honestly */
  approximate?: boolean;
}

export type GeocodeSearch = (query: string) => Promise<GeocodeResult[]>;
export type GeocodeReverse = (lng: number, lat: number) => Promise<GeocodeResult | null>;

/* the mock's gazetteer — a small index over the demo region (Western Europe).
   A real geocoder's coverage is the whole planet; this is deliberately tiny and
   labeled so a demo search resolves to a real place without any network. */
const GAZETTEER: GeocodeResult[] = [
  { label: "Brussels, Belgium", lng: 4.3517, lat: 50.8503 },
  { label: "Ghent, Belgium", lng: 3.7174, lat: 51.0543 },
  { label: "Antwerp, Belgium", lng: 4.4025, lat: 51.2194 },
  { label: "Bruges, Belgium", lng: 3.2247, lat: 51.2093 },
  { label: "Leuven, Belgium", lng: 4.7005, lat: 50.8798 },
  { label: "Liège, Belgium", lng: 5.5797, lat: 50.6326 },
  { label: "Amsterdam, Netherlands", lng: 4.9041, lat: 52.3676 },
  { label: "Rotterdam, Netherlands", lng: 4.4777, lat: 51.9244 },
  { label: "Utrecht, Netherlands", lng: 5.1214, lat: 52.0907 },
  { label: "The Hague, Netherlands", lng: 4.3007, lat: 52.0705 },
  { label: "Paris, France", lng: 2.3522, lat: 48.8566 },
  { label: "Lille, France", lng: 3.0573, lat: 50.6292 },
  { label: "Cologne, Germany", lng: 6.9603, lat: 50.9375 },
  { label: "Düsseldorf, Germany", lng: 6.7735, lat: 51.2277 },
  { label: "Hamburg, Germany", lng: 9.9937, lat: 53.5511 },
  { label: "London, United Kingdom", lng: -0.1276, lat: 51.5072 },
  { label: "Luxembourg City, Luxembourg", lng: 6.1296, lat: 49.6116 },
];

/* the demo region's centre — the deterministic fallback anchors near here */
const REGION_CENTER: LngLat = [4.9, 51.2];

/* deterministic 0..1 hash of a string (mulberry-style mix) — same query, same
   fallback point every run (offline-deterministic) */
function hash01(s: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* the LOCAL MOCK forward geocoder — substring match over the gazetteer; on no
   match one deterministic point near the region centre, flagged `approximate`. A
   real provider returns [] on no match; the demo keeps the flow alive on purpose. */
export const mockGeocode: GeocodeSearch = async (query) => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = GAZETTEER.filter((g) => g.label.toLowerCase().includes(q)).slice(0, 6);
  if (hits.length) return hits;
  return [
    {
      label: `${query} (approx.)`,
      lng: Number((REGION_CENTER[0] + (hash01(q, 1) - 0.5) * 6).toFixed(4)),
      lat: Number((REGION_CENTER[1] + (hash01(q, 2) - 0.5) * 4).toFixed(4)),
      approximate: true,
    },
  ];
};

/* the LOCAL MOCK reverse geocoder — the nearest gazetteer place, labeled with its
   name when close, else "near <place>"; always `approximate`. A real reverse
   geocoder returns a street address. */
export const mockReverse: GeocodeReverse = async (lng, lat) => {
  let best: GeocodeResult | null = null;
  let bestD = Infinity;
  for (const g of GAZETTEER) {
    const d = haversine([lng, lat], [g.lng, g.lat]);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  if (!best) return { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lng, lat, approximate: true };
  const label = bestD < 4000 ? best.label : `Near ${best.label} · ${(bestD / 1000).toFixed(0)} km`;
  return { label, lng, lat, approximate: true };
};

/* ── config-pluggable providers ──────────────────────────────────────────── */

export function makeGeocodeProvider(endpoint?: string): GeocodeSearch {
  if (!endpoint) return mockGeocode;
  return async (query) => {
    const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as GeocodeResult[]) : [];
  };
}

export function makeReverseGeocoder(endpoint?: string): GeocodeReverse {
  if (!endpoint) return mockReverse;
  return async (lng, lat) => {
    const res = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}lat=${lat}&lon=${lng}&reverse=1`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`reverse ${res.status}`);
    const data: unknown = await res.json();
    if (Array.isArray(data)) return (data[0] as GeocodeResult) ?? null;
    return (data as GeocodeResult) ?? null;
  };
}
