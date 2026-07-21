import * as React from "react";
import { MapPin } from "lucide-react";
import type { ViewDefinition } from "../types";
import { mapDefaultConfig, mapValidateConfig } from "./geo";

/* Map view — records with lat/lng as markers/clusters with record-card popups.
   Config keys: `latField`/`lngField` (number fields; inferred from lat/lng-
   style names), `titleField` (default: the primary field), `colorField`
   (select — marker tint from its option palette). The component is HEAVY
   (react-map-gl + maplibre-gl) and ships as a lazy chunk; the host's Suspense
   covers the load. */

const MapView = React.lazy(() => import("./MapView"));

const definition: ViewDefinition = {
  type: "map",
  label: "Map",
  icon: <MapPin size={13} />,
  component: MapView,
  configSchema: [
    { key: "latField", label: "Latitude", kind: "field", fieldTypes: ["number"], required: true },
    { key: "lngField", label: "Longitude", kind: "field", fieldTypes: ["number"], required: true },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "colorField", label: "Color by", kind: "field", fieldTypes: ["select"] },
  ],
  defaultConfig: mapDefaultConfig,
  validateConfig: mapValidateConfig,
};

export default definition;
