import type { ObjectConfig } from "../../types";
// explicit .ts on the runtime cross-imports so the node:test unit runner resolves
// them (allowImportingTsExtensions is on; vite/tsc handle them the same)
import { ALL_BASEMAPS, resolveOfferedBasemaps, type BasemapId } from "./basemaps.ts";
import { inferCoordFields } from "./geo.ts";
import type { Profile } from "./routing.ts";

/* Pure config → resolved-options mapping for the map view — no browser, no
   maplibre: MapView spreads these and the mapping is what unit tests cover
   (mirrors calendar/viewOptions.ts). Config is the SINGLE source for every
   capability, each with a sensible default (works out of the box) and overridable
   (a client tailors it via the view config). Runtime layer visibility, the active
   basemap, and the overlay toggles live in the viewState bag and are resolved here
   against the config default, so a saved view remembers what the user turned on. */

export interface MapTools {
  draw: boolean; // draw + measure (line/polygon/radius)
  filterByArea: boolean; // a drawn shape filters the visible records
  geocode: boolean; // address search + reverse "what's here?"
  route: boolean; // turn-by-turn directions / itinerary between points
  addPoint: boolean; // click the map to create a record there
  contextMenu: boolean; // right-click menu (directions · what's here · add)
}

export interface MapControls {
  scale: boolean;
  geolocate: boolean;
  fullscreen: boolean;
  minimap: boolean; // overview inset with a viewport rectangle
}

/* the camera "feel" surface — pitch/rotate range, the initial 3D pose, and what a
   double-click does (zoom toward the cursor, or drop a point) */
export interface MapCamera {
  maxPitch: number; // 0 = flat only; up to 85 for a low-angle 3D view
  initialPitch: number;
  initialBearing: number;
  doubleClickAction: "zoom" | "addPoint";
}

/* 3D / relief. Buildings + Esri hillshade are keyless + CSP-safe; a real-DEM
   terrain mesh is a documented SEAM (its tile host must be CSP-allowed). */
export interface MapTerrain {
  buildings3d: boolean; // extrude buildings on vector basemaps at high zoom
  hillshade: boolean; // shaded relief overlay
  demUrl?: string; // SEAM: raster-dem (terrarium) tiles → real 3D terrain
  exaggeration: number; // terrain vertical exaggeration when demUrl is set
}

export interface MapRouting {
  profile: Profile; // driving | walking | cycling
  osrmBaseUrl?: string; // "" disables the public demo → mock only
  endpoint?: string; // custom app proxy (overrides OSRM)
}

export interface MapOptions {
  latField: string;
  lngField: string;
  titleField?: string;
  colorField?: string;
  sizeField?: string;
  basemaps: BasemapId[]; // the offered set (switcher entries)
  defaultBasemap: BasemapId; // always a member of `basemaps`
  clustering: { enabled: boolean; radius: number; threshold: number };
  heatmap: { enabled: boolean; weightField?: string };
  camera: MapCamera;
  terrain: MapTerrain;
  routing: MapRouting;
  tools: MapTools;
  controls: MapControls;
  legend: boolean;
}

const bool = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown, d: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

const PROFILES: Profile[] = ["driving", "walking", "cycling"];
const profile = (v: unknown): Profile => (typeof v === "string" && (PROFILES as string[]).includes(v) ? (v as Profile) : "driving");

/* resolve the full option bundle from an object + its view config entry */
export function resolveMapOptions(object: ObjectConfig, cfg: Record<string, unknown>): MapOptions {
  const offered = resolveOfferedBasemaps(cfg.basemaps);
  const wanted = str(cfg.defaultBasemap) as BasemapId | undefined;
  const defaultBasemap = wanted && offered.includes(wanted) ? wanted : offered[0];

  const inferred = inferCoordFields(object);
  const latField = str(cfg.latField) ?? inferred.latField ?? "";
  const lngField = str(cfg.lngField) ?? inferred.lngField ?? "";

  return {
    latField,
    lngField,
    titleField: str(cfg.titleField),
    colorField: str(cfg.colorField),
    sizeField: str(cfg.sizeField),
    basemaps: offered,
    defaultBasemap,
    clustering: {
      enabled: bool(cfg.clustering, true),
      radius: num(cfg.clusterRadius, 50, 20, 100), // same range as the runtime slider
      threshold: num(cfg.clusterThreshold, 25, 1, 100_000),
    },
    heatmap: { enabled: bool(cfg.heatmap, false), weightField: str(cfg.heatmapWeightField) },
    camera: {
      maxPitch: num(cfg.maxPitch, 72, 0, 85),
      initialPitch: num(cfg.initialPitch, 0, 0, 85),
      initialBearing: num(cfg.initialBearing, 0, -180, 180),
      doubleClickAction: cfg.doubleClickAction === "addPoint" ? "addPoint" : "zoom",
    },
    terrain: {
      buildings3d: bool(cfg.buildings3d, true),
      hillshade: bool(cfg.hillshade, false),
      demUrl: str(cfg.terrainDemUrl),
      exaggeration: num(cfg.terrainExaggeration, 1.3, 0.1, 4),
    },
    routing: {
      profile: profile(cfg.routeProfile),
      // default: the keyless public OSRM demo (auto-falls back to the mock if the
      // host is CSP-blocked). Set "" to force the mock; set a custom endpoint to proxy.
      osrmBaseUrl: typeof cfg.osrmBaseUrl === "string" ? cfg.osrmBaseUrl : "https://router.project-osrm.org",
      endpoint: str(cfg.routeEndpoint),
    },
    tools: {
      draw: bool(cfg.draw, true),
      filterByArea: bool(cfg.filterByArea, true),
      geocode: bool(cfg.geocode, true),
      route: bool(cfg.route, true),
      addPoint: bool(cfg.addPoint, true),
      contextMenu: bool(cfg.contextMenu, true),
    },
    controls: {
      scale: bool(cfg.scaleControl, true),
      geolocate: bool(cfg.geolocateControl, true),
      fullscreen: bool(cfg.fullscreenControl, true),
      minimap: bool(cfg.minimap, false),
    },
    legend: bool(cfg.legend, true),
  };
}

/* ---- runtime layer/basemap resolvers (config default ← viewState override) ---- */

export const activeBasemap = (opts: MapOptions, viewState: Record<string, unknown>): BasemapId => {
  const v = viewState.mapBasemap;
  return typeof v === "string" && opts.basemaps.includes(v as BasemapId) ? (v as BasemapId) : opts.defaultBasemap;
};

/* the points layer (records as pins/circles); default on */
export const pointsOn = (viewState: Record<string, unknown>): boolean =>
  typeof viewState.mapPoints === "boolean" ? viewState.mapPoints : true;

/* clustering the points layer; default = config */
export const clustersOn = (opts: MapOptions, viewState: Record<string, unknown>): boolean =>
  typeof viewState.mapClusters === "boolean" ? viewState.mapClusters : opts.clustering.enabled;

/* the heatmap layer; default = config */
export const heatmapOn = (opts: MapOptions, viewState: Record<string, unknown>): boolean =>
  typeof viewState.mapHeatmap === "boolean" ? viewState.mapHeatmap : opts.heatmap.enabled;

/* 3D building extrusions; default = config (only render on vector basemaps) */
export const buildings3dOn = (opts: MapOptions, viewState: Record<string, unknown>): boolean =>
  typeof viewState.mapBuildings3d === "boolean" ? viewState.mapBuildings3d : opts.terrain.buildings3d;

/* shaded-relief hillshade overlay; default = config */
export const hillshadeOn = (opts: MapOptions, viewState: Record<string, unknown>): boolean =>
  typeof viewState.mapHillshade === "boolean" ? viewState.mapHillshade : opts.terrain.hillshade;

/* the effective cluster radius: the runtime slider override (viewState) clamped,
   else the config default */
export const clusterRadius = (opts: MapOptions, viewState: Record<string, unknown>): number =>
  typeof viewState.clusterRadius === "number" && Number.isFinite(viewState.clusterRadius)
    ? Math.min(100, Math.max(20, viewState.clusterRadius))
    : opts.clustering.radius;

/* the routing profile: the runtime override (viewState) else the config default */
export const routeProfile = (opts: MapOptions, viewState: Record<string, unknown>): Profile => {
  const v = viewState.mapRouteProfile;
  return typeof v === "string" && (["driving", "walking", "cycling"] as string[]).includes(v) ? (v as Profile) : opts.routing.profile;
};

/* the effective render: cluster mode only when points ON, clusters ON, and the
   located count clears the threshold — else individual DOM markers. Heatmap is
   independent of both. */
export function renderMode(
  opts: MapOptions,
  viewState: Record<string, unknown>,
  locatedCount: number,
): { points: boolean; clusters: boolean; heatmap: boolean } {
  const points = pointsOn(viewState);
  const clusters = points && clustersOn(opts, viewState) && locatedCount > opts.clustering.threshold;
  return { points, clusters, heatmap: heatmapOn(opts, viewState) };
}

export { ALL_BASEMAPS };
