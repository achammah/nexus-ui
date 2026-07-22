import type { LngLat } from "./geomath";
import { haversine } from "./geomath";

/* Geocoding + routing SEAM for the map view.
   ─────────────────────────────────────────────────────────────────────────────
   ⚑ FLAGGED SEAM. Address geocoding and turn-by-turn routing need an external
   provider (Nominatim/OSM, Mapbox, Google, OpenRouteService, …) — each with a key
   and/or a usage policy. NONE is hardcoded here (no key can leak, no blocked host).
   This module defines the provider INTERFACE and ships a deterministic LOCAL MOCK
   that works offline / in CI and returns the REAL payload SHAPE, so the search-and-
   geocode and route-between-records capabilities are wired end-to-end against a
   contract a real provider drops straight into.

   To wire a real provider: pass `geocodeProvider` / `routeProvider` to MapView
   (via the app, e.g. a server route that proxies the keyed vendor call) — the
   result shapes below are exactly what MapView consumes. See docs/RECIPES.md
   "Give an object a map view" › geocode/route seam. */

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

export interface RouteResult {
  /* the path geometry, GeoJSON [lng, lat] order (a real provider returns road
     geometry; the mock returns a densified great-circle path) */
  coordinates: LngLat[];
  distanceM: number;
  durationS: number;
  approximate?: boolean;
}

export type GeocodeProvider = (query: string) => Promise<GeocodeResult[]>;
export type RouteProvider = (waypoints: LngLat[]) => Promise<RouteResult>;

/* the mock's gazetteer — a small index over the demo region (Western Europe).
   A real geocoder's coverage is the whole planet; this is deliberately tiny and
   labeled so a demo search resolves to a real place without any network. */
const GAZETTEER: GeocodeResult[] = [
  { label: "Brussels, Belgium", lng: 4.3517, lat: 50.8503 },
  { label: "Ghent, Belgium", lng: 3.7174, lat: 51.0543 },
  { label: "Antwerp, Belgium", lng: 4.4025, lat: 51.2194 },
  { label: "Bruges, Belgium", lng: 3.2247, lat: 51.2093 },
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

/* the LOCAL MOCK geocoder — substring match over the gazetteer; on no match one
   deterministic point near the region centre, flagged `approximate` so the UI
   labels it. A real provider returns [] on no match; the demo keeps the flow
   alive on purpose. */
export const mockGeocode: GeocodeProvider = async (query) => {
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

/* the LOCAL MOCK router — densifies a great-circle path through the waypoints,
   distance by haversine, duration at ~48 km/h (13.3 m/s) as a stand-in for a road
   ETA. A real router returns snapped road geometry + a real duration; this is the
   same SHAPE. */
export const mockRoute: RouteProvider = async (waypoints) => {
  const coordinates: LngLat[] = [];
  const STEPS = 24;
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const a = waypoints[leg];
    const b = waypoints[leg + 1];
    for (let s = 0; s <= STEPS; s++) {
      if (leg > 0 && s === 0) continue; // avoid duplicating the shared vertex
      const t = s / STEPS;
      coordinates.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  let distanceM = 0;
  for (let i = 1; i < waypoints.length; i++) distanceM += haversine(waypoints[i - 1], waypoints[i]);
  return { coordinates, distanceM, durationS: distanceM / 13.3, approximate: true };
};

/* ── config-pluggable providers ──────────────────────────────────────────────
   The map view resolves its provider from an OPTIONAL endpoint URL in the view
   config (`geocodeEndpoint` / `routeEndpoint`). Point it at an APP route that
   proxies a keyed vendor SERVER-SIDE (the key never reaches the browser) and
   returns the shapes above; leave it unset and the local mock runs. This is the
   whole seam: no code change to swap the mock for production. */

export function makeGeocodeProvider(endpoint?: string): GeocodeProvider {
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

export function makeRouteProvider(endpoint?: string): RouteProvider {
  if (!endpoint) return mockRoute;
  return async (waypoints) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ waypoints }),
    });
    if (!res.ok) throw new Error(`route ${res.status}`);
    return (await res.json()) as RouteResult;
  };
}
