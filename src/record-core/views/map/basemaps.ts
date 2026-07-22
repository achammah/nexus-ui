import type { StyleSpecification } from "maplibre-gl";

/* Basemap catalogue for the map view — the streets/light/dark/satellite/terrain
   switcher. Every source is FREE and keyless (no token leaks): vector styles from
   OpenFreeMap + CARTO, raster imagery from Esri World Imagery and OpenTopoMap.
   A vector basemap is a style URL; a raster basemap is a hand-built raster
   StyleSpecification (its own attribution). When a style/tile host is unreachable
   (offline, CI, a blocked host) MapView swaps in the token-only fallback below and
   keeps every overlay working — so a basemap that fails to load degrades, never
   crashes. GL text needs style glyphs, which the vector styles ship and the raster
   ones do not (`hasGlyphs`) — the cluster-count labels mount only where glyphs
   exist; the raster basemaps still size cluster circles by count. */

export type BasemapId = "streets" | "light" | "dark" | "satellite" | "terrain";

export const ALL_BASEMAPS: BasemapId[] = ["streets", "light", "dark", "satellite", "terrain"];

export const BASEMAP_LABELS: Record<BasemapId, string> = {
  streets: "Streets",
  light: "Light",
  dark: "Dark",
  satellite: "Satellite",
  terrain: "Terrain",
};

interface BasemapSpec {
  id: BasemapId;
  /* dark imagery → invert control glyphs + lighten attribution over it */
  dark: boolean;
  /* the style ships text glyphs → cluster-count symbol layer can mount */
  hasGlyphs: boolean;
  /* a vector style URL, or a factory that builds a raster StyleSpecification */
  style: string | (() => StyleSpecification);
}

/* raster StyleSpecification from an XYZ tile template (+ its own attribution) */
const raster = (tiles: string[], attribution: string, maxzoom = 19): StyleSpecification => ({
  version: 8,
  sources: { basemap: { type: "raster", tiles, tileSize: 256, attribution, maxzoom } },
  layers: [{ id: "basemap", type: "raster", source: "basemap" }],
});

const SPECS: Record<BasemapId, BasemapSpec> = {
  streets: {
    id: "streets",
    dark: false,
    hasGlyphs: true,
    style: "https://tiles.openfreemap.org/styles/bright",
  },
  light: {
    id: "light",
    dark: false,
    hasGlyphs: true,
    style: "https://tiles.openfreemap.org/styles/positron",
  },
  dark: {
    id: "dark",
    dark: true,
    hasGlyphs: true,
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  satellite: {
    id: "satellite",
    dark: true,
    hasGlyphs: false,
    // HYBRID satellite (Google-default): Esri World Imagery + transparent reference
    // overlays for roads + place labels, so the imagery carries orienting text.
    // ArcGIS REST tile order is {z}/{y}/{x}.
    style: () => ({
      version: 8,
      sources: {
        basemap: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
          maxzoom: 19,
        },
        "sat-roads": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
        },
        "sat-labels": {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256,
          maxzoom: 19,
        },
      },
      layers: [
        { id: "basemap", type: "raster", source: "basemap" },
        // the reference overlays are RASTER (fixed glyph size); dial their opacity
        // down so the labels read as a subtle hybrid, not bold billboards
        { id: "sat-roads", type: "raster", source: "sat-roads", paint: { "raster-opacity": 0.85 } },
        { id: "sat-labels", type: "raster", source: "sat-labels", paint: { "raster-opacity": 0.68 } },
      ],
    }),
  },
  terrain: {
    id: "terrain",
    dark: false,
    hasGlyphs: false,
    style: () =>
      raster(
        [
          "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
          "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
        ],
        "© OpenTopoMap (CC-BY-SA), © OpenStreetMap contributors",
        17,
      ),
  },
};

const spec = (id: BasemapId): BasemapSpec => SPECS[id] ?? SPECS.streets;

/* the mapStyle value for a basemap: a URL string (vector) or a StyleSpecification
   (raster). Called fresh per basemap change so raster styles get a new object. */
export const basemapStyle = (id: BasemapId): string | StyleSpecification => {
  const s = spec(id);
  return typeof s.style === "function" ? s.style() : s.style;
};

export const isDarkBasemap = (id: BasemapId): boolean => spec(id).dark;
export const basemapHasGlyphs = (id: BasemapId): boolean => spec(id).hasGlyphs;

/* the token-only fallback style — a single background layer painted the app's
   sunken tone. No sources, no glyphs: markers, clusters, heatmap, draw and popups
   all keep rendering on a plain canvas when tiles are unreachable. */
export const fallbackStyle = (bg: string): StyleSpecification => ({
  version: 8,
  name: "offline-fallback",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": bg || "#e8e6e1" } }],
});

/* keep an offered set honest: valid ids, de-duplicated, order-preserving; empty
   or all-invalid falls back to the full set (a basemap switcher never renders empty) */
export const resolveOfferedBasemaps = (raw: unknown): BasemapId[] => {
  if (!Array.isArray(raw)) return ALL_BASEMAPS;
  const seen = new Set<string>();
  const out = raw.filter(
    (v): v is BasemapId =>
      typeof v === "string" && (ALL_BASEMAPS as string[]).includes(v) && !seen.has(v) && (seen.add(v), true),
  );
  return out.length ? out : ALL_BASEMAPS;
};
