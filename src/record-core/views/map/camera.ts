import type { Map as MaplibreMap, LngLatLike } from "maplibre-gl";
import { ESRI_HILLSHADE } from "./basemaps";
import type { LngLat } from "./geomath";

/* Camera + 3D augments for the map view — the "Google-Maps feel" core.
   ─────────────────────────────────────────────────────────────────────────────
   Two concerns live here, both pure-ish (a maplibre Map in, side effects out, no
   React): (1) EASED CAMERA moves — a double-click that zooms toward the cursor
   (the point stays put under the pointer), and fly/ease helpers with a premium
   easing curve, all honoring reduced-motion; (2) STYLE AUGMENTS — 3D building
   extrusions, a shaded-relief hillshade, and optional real-DEM 3D terrain, each
   idempotent and re-applied on every basemap swap (setStyle wipes custom layers).
   Keeping this out of MapView keeps the component about state, not GL plumbing. */

/* ── easings ──────────────────────────────────────────────────────────────── */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ── eased camera moves ───────────────────────────────────────────────────── */

/* fly to a point with the arced, eased Google-Earth-style move (used by search,
   "directions", context-menu → center-here). Instant under reduced motion. */
export function flyToPoint(map: MaplibreMap, lng: number, lat: number, zoom: number, reduceMotion: boolean): void {
  map.flyTo({
    center: [lng, lat],
    zoom,
    duration: reduceMotion ? 0 : 900,
    curve: 1.42,
    speed: 1.2,
    easing: easeInOutCubic,
    essential: true,
  });
}

/* zoom IN/OUT keeping the given geographic point fixed under the cursor — the
   double-click gesture. `around` is what makes the clicked spot stay put (Google
   Maps behavior) instead of recentring. */
export function zoomAroundPoint(map: MaplibreMap, lngLat: LngLatLike, delta: number, reduceMotion: boolean): void {
  const zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), map.getZoom() + delta));
  map.easeTo({ zoom, around: lngLat, duration: reduceMotion ? 0 : 460, easing: easeOutCubic, essential: true });
}

/* fit a route/itinerary into view with generous padding for the panel + chrome */
export function fitToCoords(map: MaplibreMap, coords: LngLat[], reduceMotion: boolean, leftPad = 300): void {
  if (coords.length === 0) return;
  let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  map.fitBounds(
    [[minLng, minLat], [maxLng, maxLat]],
    { padding: { top: 72, bottom: 96, left: leftPad, right: 48 }, maxZoom: 15, duration: reduceMotion ? 0 : 700 },
  );
}

/* the four map-viewport corners as [lng,lat] (a quad, so it stays correct under
   rotation + pitch) — the minimap draws this as its "you are here" rectangle */
export function viewportRing(map: MaplibreMap): LngLat[] {
  const c = map.getCanvas();
  const w = c.clientWidth || c.width;
  const h = c.clientHeight || c.height;
  return ([[0, 0], [w, 0], [w, h], [0, h]] as const).map(([x, y]) => {
    const ll = map.unproject([x, y]);
    return [ll.lng, ll.lat] as LngLat;
  });
}

/* ── style augments (3D) ──────────────────────────────────────────────────── */

export interface Augments {
  buildings3d: boolean;
  buildingColor: string; // resolved token literal (GL can't read CSS vars)
  hillshade: boolean;
  hillshadeOpacity: number;
  /* SEAM: raster-dem XYZ tile template (terrarium encoding). When set, real 3D
     terrain + a DEM-based hillshade replace the flat Esri relief. Off by default
     (its tile host must be on the app CSP allow-list). */
  terrainDemUrl?: string;
  terrainExaggeration: number;
}

const BUILDINGS_LAYER = "nx-3d-buildings";
const HILLSHADE_RASTER_SRC = "nx-hillshade-src";
const HILLSHADE_RASTER_LAYER = "nx-hillshade";
const DEM_SRC = "nx-dem";
const DEM_HILLSHADE_LAYER = "nx-dem-hillshade";

/* the vector source that carries `building` geometry, if this style has one
   (OpenMapTiles schema → source-layer "building"); null on raster basemaps */
function buildingSource(map: MaplibreMap): string | null {
  const layers = map.getStyle()?.layers ?? [];
  for (const l of layers) {
    const sl = (l as { "source-layer"?: string })["source-layer"];
    const src = (l as { source?: string }).source;
    if (sl === "building" && typeof src === "string") return src;
  }
  return null;
}

/* the first symbol (label) layer — insert extrusions/relief beneath it so labels
   stay legible on top */
function firstSymbolId(map: MaplibreMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
}

/* apply ALL augments idempotently — safe to call on every style load. Adds what's
   requested + present, removes what isn't. */
export function applyAugments(map: MaplibreMap, a: Augments): void {
  apply3dBuildings(map, a.buildings3d, a.buildingColor);
  applyRelief(map, a);
}

/* atmosphere halo for the globe projections — the sky/space gradient + the thin
   atmosphere rim are what make Globe and Earth read as one planetary mode instead
   of a flat style with curvature bolted on. Idempotent; a no-op sky when flat. */
export function applySky(map: MaplibreMap, globe: boolean, dark: boolean): void {
  try {
    if (!globe) {
      map.setSky({ "atmosphere-blend": 0 });
      return;
    }
    map.setSky({
      "sky-color": dark ? "#0b1026" : "#7fb8e6",
      "horizon-color": dark ? "#1c2b4a" : "#d9ecfa",
      "fog-color": dark ? "#10182e" : "#f2f8fd",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.85,
      // full halo when the planet is in frame, fading out as the camera closes in
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 9, 0.1] as unknown as number,
    });
  } catch {
    /* sky unsupported on this build — globe still renders, just without the halo */
  }
}

function apply3dBuildings(map: MaplibreMap, on: boolean, color: string): void {
  const has = !!map.getLayer(BUILDINGS_LAYER);
  const src = on ? buildingSource(map) : null;
  if (!src) {
    if (has) map.removeLayer(BUILDINGS_LAYER);
    return;
  }
  if (has) {
    map.setPaintProperty(BUILDINGS_LAYER, "fill-extrusion-color", color);
    return;
  }
  map.addLayer(
    {
      id: BUILDINGS_LAYER,
      type: "fill-extrusion",
      source: src,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": color,
        // fade extrusions in between z14–16 so they don't pop; height reads the
        // OpenMapTiles render_height (fallbacks keep it robust across schemas). A
        // 8 m floor ("at least ~2 storeys") keeps buildings legible where OSM data
        // lacks a height tag — most footprints — without inventing tall towers.
        "fill-extrusion-height": [
          "interpolate", ["linear"], ["zoom"],
          14, 0,
          16, ["max", 8, ["coalesce", ["get", "render_height"], ["get", "height"], 8]],
        ],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.85,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    firstSymbolId(map),
  );
}

function applyRelief(map: MaplibreMap, a: Augments): void {
  const wantDem = !!a.terrainDemUrl;
  const wantRaster = a.hillshade && !wantDem;

  // real DEM terrain (seam) — a raster-dem source drives setTerrain + a hillshade
  if (wantDem) {
    if (!map.getSource(DEM_SRC)) {
      map.addSource(DEM_SRC, {
        type: "raster-dem",
        tiles: [a.terrainDemUrl as string],
        tileSize: 256,
        encoding: "terrarium",
        maxzoom: 15,
      });
    }
    map.setTerrain({ source: DEM_SRC, exaggeration: a.terrainExaggeration });
    if (a.hillshade && !map.getLayer(DEM_HILLSHADE_LAYER)) {
      map.addLayer(
        { id: DEM_HILLSHADE_LAYER, type: "hillshade", source: DEM_SRC, paint: { "hillshade-exaggeration": 0.5 } },
        firstSymbolId(map),
      );
    } else if (!a.hillshade && map.getLayer(DEM_HILLSHADE_LAYER)) {
      map.removeLayer(DEM_HILLSHADE_LAYER);
    }
  } else {
    if (map.getTerrain()) map.setTerrain(null);
    if (map.getLayer(DEM_HILLSHADE_LAYER)) map.removeLayer(DEM_HILLSHADE_LAYER);
    if (map.getSource(DEM_SRC)) map.removeSource(DEM_SRC);
  }

  // CSP-safe raster shaded relief (Esri) — the default hillshade when no DEM seam
  if (wantRaster) {
    if (!map.getSource(HILLSHADE_RASTER_SRC)) {
      map.addSource(HILLSHADE_RASTER_SRC, {
        type: "raster",
        tiles: [ESRI_HILLSHADE],
        tileSize: 256,
        attribution: "Hillshade © Esri",
        maxzoom: 16,
      });
    }
    if (!map.getLayer(HILLSHADE_RASTER_LAYER)) {
      map.addLayer(
        { id: HILLSHADE_RASTER_LAYER, type: "raster", source: HILLSHADE_RASTER_SRC, paint: { "raster-opacity": a.hillshadeOpacity } },
        firstSymbolId(map),
      );
    } else {
      map.setPaintProperty(HILLSHADE_RASTER_LAYER, "raster-opacity", a.hillshadeOpacity);
    }
  } else {
    if (map.getLayer(HILLSHADE_RASTER_LAYER)) map.removeLayer(HILLSHADE_RASTER_LAYER);
    if (map.getSource(HILLSHADE_RASTER_SRC)) map.removeSource(HILLSHADE_RASTER_SRC);
  }
}
