import * as React from "react";
import { Map as MapGL, Source, Layer } from "react-map-gl/maplibre";
import type { LngLat } from "./geomath";

/* Overview / minimap inset — a small, non-interactive follower map zoomed out
   from the main camera, with a rectangle showing the current viewport (a quad, so
   it stays correct under rotation + pitch). Uses a fixed light vector style so the
   overview reads cleanly over any main basemap; if its tiles are unreachable the
   inset simply stays blank (never blocks the main map). Toggled by config/runtime;
   token-framed in map.css. */

const OVERVIEW_STYLE = "https://tiles.openfreemap.org/styles/positron";

export function Minimap({
  center,
  zoom,
  ring,
  accent,
  onRecenter,
}: {
  center: { lng: number; lat: number };
  zoom: number;
  ring: LngLat[];
  accent: string;
  onRecenter?: (lng: number, lat: number) => void;
}) {
  const overviewZoom = Math.max(1, zoom - 4);
  const ringData = React.useMemo<GeoJSON.Feature>(
    () => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...ring, ring[0]].map(([lng, lat]) => [lng, lat])] },
    }),
    [ring],
  );
  return (
    <div className="nxMapMinimap" data-testid="map-minimap" aria-hidden>
      <MapGL
        longitude={center.lng}
        latitude={center.lat}
        zoom={overviewZoom}
        mapStyle={OVERVIEW_STYLE}
        interactive={false}
        attributionControl={false}
        onClick={(e) => onRecenter?.(e.lngLat.lng, e.lngLat.lat)}
      >
        {ring.length >= 3 && (
          <Source id="mm-view" type="geojson" data={ringData}>
            <Layer id="mm-view-fill" type="fill" paint={{ "fill-color": accent, "fill-opacity": 0.16 }} />
            <Layer id="mm-view-line" type="line" paint={{ "line-color": accent, "line-width": 1.5 }} />
          </Source>
        )}
      </MapGL>
    </div>
  );
}
