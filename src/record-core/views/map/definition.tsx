import * as React from "react";
import { MapPin } from "lucide-react";
import type { ViewDefinition } from "../types";
import { mapDefaultConfig, mapValidateConfig } from "./geo";
import { ALL_BASEMAPS, type BasemapId } from "./basemaps";

/* Map view — records with lat/lng as markers/clusters/heatmap on a switchable
   basemap, with draw/measure, filter-by-area, search + geocode, routing and
   click-to-add. Every capability is config-composable (mapConfig.ts) with a
   sensible default; the schema below documents the surface. The component is
   HEAVY (react-map-gl + maplibre-gl) and ships as a lazy chunk. */

const MapView = React.lazy(() => import("./MapView"));

/* number-like fields (marker size / heatmap weight read a magnitude) */
const magnitudeFields = (object: { fields: { key: string; type?: string; isActive?: boolean }[] }) =>
  object.fields.filter((f) => (f.type === "number" || f.type === "currency" || f.type === "money") && f.isActive !== false);

const definition: ViewDefinition = {
  type: "map",
  label: "Map",
  icon: <MapPin size={13} />,
  component: MapView,
  configSchema: [
    // data mapping
    { key: "latField", label: "Latitude", kind: "field", fieldTypes: ["number"], required: true },
    { key: "lngField", label: "Longitude", kind: "field", fieldTypes: ["number"], required: true },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "colorField", label: "Color markers by", kind: "field", fieldTypes: ["select"] },
    { key: "sizeField", label: "Size markers by", kind: "field", fieldTypes: ["number", "currency", "money"] },
    // basemaps
    { key: "basemaps", label: "Basemaps offered", kind: "multiSelect", options: [...ALL_BASEMAPS] },
    { key: "defaultBasemap", label: "Default basemap", kind: "select", options: [...ALL_BASEMAPS] },
    // layers
    { key: "clustering", label: "Cluster nearby points", kind: "boolean" },
    { key: "clusterRadius", label: "Cluster radius (px)", kind: "number" },
    { key: "clusterThreshold", label: "Cluster above N points", kind: "number" },
    { key: "heatmap", label: "Heatmap by default", kind: "boolean" },
    { key: "heatmapWeightField", label: "Heatmap weight", kind: "field", fieldTypes: ["number", "currency", "money"] },
    { key: "legend", label: "Show legend", kind: "boolean" },
    // tools
    { key: "draw", label: "Draw + measure tools", kind: "boolean" },
    { key: "filterByArea", label: "Filter by drawn area", kind: "boolean" },
    { key: "geocode", label: "Address search (geocode)", kind: "boolean" },
    { key: "route", label: "Route between records", kind: "boolean" },
    { key: "addPoint", label: "Click to add a record", kind: "boolean" },
    // controls
    { key: "scaleControl", label: "Scale bar", kind: "boolean" },
    { key: "geolocateControl", label: "Locate-me control", kind: "boolean" },
    { key: "fullscreenControl", label: "Fullscreen control", kind: "boolean" },
    // provider seam (optional endpoint URLs → real geocode/route, else the mock)
    { key: "geocodeEndpoint", label: "Geocode endpoint URL", kind: "text" },
    { key: "routeEndpoint", label: "Route endpoint URL", kind: "text" },
  ],
  defaultConfig: mapDefaultConfig,
  validateConfig: (object, cfg) => {
    // coordinate/color/title validation stays in the pure core (its unit tests)
    const base = mapValidateConfig(object, cfg);
    if (base) return base;
    const nums = magnitudeFields(object);
    for (const key of ["sizeField", "heatmapWeightField"] as const) {
      const v = cfg[key];
      if (typeof v === "string" && v && !nums.some((f) => f.key === v))
        return `${key} “${v}” is not a number or currency field of ${object.key}`;
    }
    const db = cfg.defaultBasemap;
    if (typeof db === "string" && db && !(ALL_BASEMAPS as string[]).includes(db))
      return `defaultBasemap “${db}” is not one of ${ALL_BASEMAPS.join(", ")}`;
    if (Array.isArray(cfg.basemaps)) {
      const bad = cfg.basemaps.find((b) => !(ALL_BASEMAPS as string[]).includes(b as BasemapId));
      if (bad !== undefined) return `basemaps includes “${bad}”, not one of ${ALL_BASEMAPS.join(", ")}`;
    }
    return null;
  },
};

export default definition;
