// cluster layer config adapted from visgl/react-map-gl examples/maplibre/clusters (MIT)
import * as React from "react";
import {
  Map as MapGL,
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
} from "react-map-gl/maplibre";
import type { MapRef, MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { GeoJSONSource, Map as MaplibreMap, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { Button } from "../../../primitives/Button";
import { Badge } from "../../../primitives/fields";
import { ThinkingDots } from "../../../primitives/ThinkingDots";
import { RecordCard } from "../../RecordCard";
import { activeFields, optionMeta } from "../../options";
import { normalizeOption } from "../../types";
import { useTokenColors } from "../../../tokens/resolve";
import type { ViewProps } from "../types";
import {
  CLUSTER_THRESHOLD,
  boundsOf,
  splitRows,
  toFeatureCollection,
} from "./geo";

/* Map view — records with valid lat/lng plotted on a free vector basemap
   (OpenFreeMap, no token). Two render modes by scale:
     · ≤ CLUSTER_THRESHOLD located rows — one DOM <Marker> per record: a real
       token-colored pin BUTTON (keyboard-focusable, option-palette tint);
     · past it — a GeoJSON <Source cluster> with GL circle/symbol layers
       (GPU clustering; cluster click zooms to expansion).
   Popups render the shared RecordCard + an Open button into the record peek.
   GL paint cannot read CSS custom properties, so cluster/point colors resolve
   from tokens to literals at mount and re-resolve on live theme/skin changes
   (tokens/resolve.ts). When the style/tiles are unreachable (offline, CI) the
   map falls back to an inline background-only style: markers, clustering and
   popups keep working on a plain token canvas. */

const OPENFREEMAP_BRIGHT = "https://tiles.openfreemap.org/styles/bright";
/* count labels need style glyphs — the offline fallback has none, so the count
   symbol layer only mounts on the remote style */
const fallbackStyle = (bg: string): StyleSpecification => ({
  version: 8,
  name: "offline-fallback",
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": bg || "#e8e6e1" } }],
});

const SOURCE_ID = "map-records";

function MapView({ object, rows, viewConfig, onOpen }: ViewProps) {
  const latKey = String(viewConfig.latField ?? "");
  const lngKey = String(viewConfig.lngField ?? "");
  const titleKey = typeof viewConfig.titleField === "string" ? viewConfig.titleField : undefined;
  const colorKey = typeof viewConfig.colorField === "string" && viewConfig.colorField ? viewConfig.colorField : undefined;
  const colorField = colorKey ? object.fields.find((f) => f.key === colorKey) : undefined;
  const titleField = (titleKey ? object.fields.find((f) => f.key === titleKey) : undefined)
    ?? object.fields.find((f) => f.primary) ?? object.fields[0];

  const { located, withoutLocation } = React.useMemo(
    () => splitRows(rows, latKey, lngKey),
    [rows, latKey, lngKey],
  );
  const clustered = located.length > CLUSTER_THRESHOLD;

  /* GL paint literals — token-resolved, live on theme/skin flips */
  const optionColors = React.useMemo(() => {
    const names = new Set<string>();
    for (const o of colorField?.options ?? []) {
      const c = normalizeOption(o).color;
      if (c) names.add(`nx-opt-${c}`);
    }
    return [...names];
  }, [colorField]);
  const colors = useTokenColors(["nx-accent", "nx-accent-fg", "nx-bg-raised", "nx-bg-sunken", ...optionColors]);

  /* offline/CI degradation: any pre-load error (style fetch, tiles host down)
     or a stalled style load swaps in the background-only fallback */
  const [styleFailed, setStyleFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const loadedRef = React.useRef(false);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (!loadedRef.current) setStyleFailed(true);
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  /* WebGL2 is a maplibre requirement — degrade to a designed chip without it */
  const [glOk] = React.useState(() => {
    try {
      return !!document.createElement("canvas").getContext("webgl2");
    } catch {
      return false;
    }
  });

  const reduceMotion = React.useMemo(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const mapRef = React.useRef<MapRef>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  /* fit-bounds to the data ONCE — on mount, or on the first rows that carry
     coords (live sync can land them later); never re-fit under the user */
  const initialView = React.useMemo(() => {
    const b = boundsOf(located);
    if (!b) return { longitude: 0, latitude: 20, zoom: 1.3 };
    if (located.length === 1) return { longitude: located[0].lng, latitude: located[0].lat, zoom: 11 };
    return { bounds: b, fitBoundsOptions: { padding: 56, maxZoom: 12 } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fittedRef = React.useRef(located.length > 0);
  React.useEffect(() => {
    if (fittedRef.current || located.length === 0) return;
    fittedRef.current = true;
    const b = boundsOf(located);
    if (b) mapRef.current?.fitBounds(b, { padding: 56, maxZoom: 12, duration: reduceMotion ? 0 : 500 });
  }, [located, reduceMotion]);

  /* maplibre's Marker.addTo() stamps role="button" + aria-label="Map marker" on
     its wrapper div (only when unset), wrapping our own labeled pin button — a
     generic-labeled button nested around the real control. Strip the wrapper
     semantics so each pin exposes exactly ONE button carrying the record title.
     Passive effect: runs after the child Marker effects that set the attrs. */
  React.useEffect(() => {
    containerRef.current?.querySelectorAll(".maplibregl-marker").forEach((wrap) => {
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
    });
  }, [located, clustered, ready]);

  /* popup targets a row id; rows changing underneath (sync) re-derive it, and a
     vanished row closes the popup instead of showing stale content */
  const [popupId, setPopupId] = React.useState<string | null>(null);
  const popupRow = popupId ? located.find((l) => String(l.row.id) === popupId) : undefined;
  React.useEffect(() => {
    if (popupId && !popupRow) setPopupId(null);
  }, [popupId, popupRow]);
  const popupOpenRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (popupRow) popupOpenRef.current?.focus();
  }, [popupRow]);

  /* popup meta: two fields beyond title/coords (the coords are the geometry) */
  const popupFields = React.useMemo(
    () =>
      activeFields(object.fields)
        .filter((f) => !f.primary && f.key !== latKey && f.key !== lngKey && f.key !== titleField.key)
        .slice(0, 2)
        .map((f) => f.key),
    [object.fields, latKey, lngKey, titleField],
  );

  /* cluster source + paint (adapted from visgl/react-map-gl clusters example, MIT) */
  const featureCollection = React.useMemo(
    () => (clustered ? toFeatureCollection(located, colorKey) : null),
    [clustered, located, colorKey],
  );
  const accent = colors["nx-accent"] || "rgba(79, 70, 229, 1)";
  const accentFg = colors["nx-accent-fg"] || "rgba(255, 255, 255, 1)";
  const surface = colors["nx-bg-raised"] || "rgba(255, 255, 255, 1)";
  const pointColor = React.useMemo(() => {
    if (!colorField) return accent;
    const pairs: string[] = [];
    for (const o of colorField.options ?? []) {
      const meta = normalizeOption(o);
      if (meta.color) pairs.push(meta.value, colors[`nx-opt-${meta.color}`] || accent);
    }
    return pairs.length ? (["match", ["get", "option"], ...pairs, accent] as unknown as string) : accent;
  }, [colorField, colors, accent]);

  /* GL state mirrored onto the container as data-attrs — canvas-painted clusters
     are not DOM, so journeys (and assistive tooling) read these instead */
  const [clusterCount, setClusterCount] = React.useState(0);
  const [zoomAttr, setZoomAttr] = React.useState<string>("");
  const syncGlState = React.useCallback((map: MaplibreMap) => {
    setZoomAttr(map.getZoom().toFixed(1));
    if (map.getLayer("map-clusters")) {
      setClusterCount(map.queryRenderedFeatures(undefined, { layers: ["map-clusters"] }).length);
    } else {
      setClusterCount(0);
    }
  }, []);

  const onMapClick = React.useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) {
        setPopupId(null);
        return;
      }
      const props = feature.properties as Record<string, unknown>;
      if (props.cluster) {
        const source = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        source?.getClusterExpansionZoom(Number(props.cluster_id)).then((zoom) => {
          mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: reduceMotion ? 0 : 500 });
        });
        return;
      }
      if (props.id != null) setPopupId(String(props.id));
    },
    [reduceMotion],
  );

  const [cursor, setCursor] = React.useState<string>();

  if (!glOk) {
    return (
      <div className="nxCard nx-pop-in" data-testid={`map-${object.key}`} data-map-unsupported="1" style={{ padding: "10px 14px", display: "inline-flex", color: "var(--nx-fg-muted)", font: "var(--nx-text-meta)" }}>
        The map view needs WebGL2, which this browser does not provide.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="nxMapView"
      data-testid={`map-${object.key}`}
      data-map-mode={clustered ? "cluster" : "markers"}
      data-map-ready={ready ? "1" : "0"}
      data-map-clusters={clusterCount}
      data-map-zoom={zoomAttr}
      data-map-tiles={styleFailed ? "fallback" : "remote"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && popupId) {
          e.stopPropagation();
          setPopupId(null);
        }
      }}
    >
      <MapGL
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={styleFailed ? fallbackStyle(colors["nx-bg-sunken"]) : OPENFREEMAP_BRIGHT}
        interactiveLayerIds={clustered ? ["map-clusters", "map-point"] : undefined}
        cursor={cursor}
        onClick={onMapClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        onLoad={(e) => {
          loadedRef.current = true;
          setReady(true);
          syncGlState(e.target);
        }}
        onError={() => {
          if (!loadedRef.current) setStyleFailed(true);
        }}
        onIdle={(e) => syncGlState(e.target)}
        onZoomEnd={(e) => setZoomAttr(e.target.getZoom().toFixed(1))}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {!clustered &&
          located.map(({ row, lat, lng }) => {
            const title = String(row[titleField.key] ?? row.id);
            const tint = colorField ? optionMeta(colorField, row[colorKey ?? ""]).color : undefined;
            return (
              <Marker key={String(row.id)} longitude={lng} latitude={lat} anchor="bottom">
                <button
                  type="button"
                  className="nxMapPin"
                  data-testid={`map-marker-${row.id}`}
                  aria-label={title}
                  style={tint ? ({ "--pin-color": `var(--nx-opt-${tint})` } as React.CSSProperties) : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPopupId(String(row.id));
                  }}
                >
                  <svg width="28" height="34" viewBox="0 0 26 31" aria-hidden="true">
                    <path
                      d="M13 1C6.4 1 1 6.3 1 12.8 1 21.3 13 30 13 30s12-8.7 12-17.2C25 6.3 19.6 1 13 1Z"
                      fill="currentColor"
                      stroke="var(--nx-bg-raised)"
                      strokeWidth="1.5"
                    />
                    <circle cx="13" cy="12.6" r="4.6" fill="var(--nx-bg-raised)" />
                  </svg>
                </button>
              </Marker>
            );
          })}

        {clustered && featureCollection && (
          <Source id={SOURCE_ID} type="geojson" data={featureCollection} cluster clusterMaxZoom={14} clusterRadius={50}>
            <Layer
              id="map-clusters"
              type="circle"
              filter={["has", "point_count"]}
              paint={{
                "circle-color": accent,
                "circle-opacity": 0.9,
                "circle-stroke-width": 2,
                "circle-stroke-color": surface,
                "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 250, 28],
              }}
            />
            {!styleFailed && (
              <Layer
                id="map-cluster-count"
                type="symbol"
                filter={["has", "point_count"]}
                layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12 }}
                paint={{ "text-color": accentFg }}
              />
            )}
            <Layer
              id="map-point"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{
                "circle-color": pointColor,
                "circle-radius": 6,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": surface,
              }}
            />
          </Source>
        )}

        {popupRow && (
          <Popup
            longitude={popupRow.lng}
            latitude={popupRow.lat}
            anchor="bottom"
            offset={clustered ? 12 : 30}
            maxWidth="280px"
            className="nxMapPopup"
            closeButton={false}
            onClose={() => setPopupId(null)}
          >
            <div data-testid="map-popup">
              <RecordCard object={object} row={popupRow.row} fields={popupFields} titleField={titleField.key} />
              <div className="nxMapPopupActions">
                <Button ref={popupOpenRef} size="sm" variant="primary" data-testid="map-popup-open" onClick={() => onOpen(String(popupRow.row.id))}>
                  Open
                </Button>
              </div>
            </div>
          </Popup>
        )}
      </MapGL>

      {withoutLocation > 0 && (
        <span className="nxMapChip nxMapChip--without" role="status" data-testid="map-without-location">
          <Badge>{withoutLocation} without location</Badge>
        </span>
      )}
      {styleFailed && (
        <span className="nxMapChip nxMapChip--tiles" role="status" data-testid="map-tiles-fallback">
          <Badge tone="warn">Map tiles unavailable</Badge>
        </span>
      )}
      {located.length === 0 && (
        <div className="nxMapEmpty" data-testid="map-empty">
          <Badge>{rows.length === 0 ? "No records to show" : "No records with coordinates"}</Badge>
        </div>
      )}
      {!ready && (
        <div className="nxMapLoading" data-testid="map-loading">
          <ThinkingDots label="Loading map" />
        </div>
      )}
    </div>
  );
}

export default MapView;
