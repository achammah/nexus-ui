// cluster + heatmap layer config adapted from visgl/react-map-gl examples/maplibre (MIT)
import * as React from "react";
import {
  Map as MapGL,
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
  ScaleControl,
  FullscreenControl,
  GeolocateControl,
} from "react-map-gl/maplibre";
import type { MapRef, MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { GeoJSONSource, Map as MaplibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { Button } from "../../../primitives/Button";
import { Badge } from "../../../primitives/fields";
import { ThinkingDots } from "../../../primitives/ThinkingDots";
import { RecordCard } from "../../RecordCard";
import { activeFields, optionMeta } from "../../options";
import { normalizeOption } from "../../types";
import { useTokenColors } from "../../../tokens/resolve";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { ViewProps } from "../types";
import {
  MARKER_DEFAULT_R,
  MARKER_MAX_R,
  MARKER_MIN_R,
  boundsOf,
  numericValue,
  radiusFor,
  sizeExtent,
  splitRows,
  toFeatureCollection,
  type LocatedRow,
} from "./geo";
import { basemapHasGlyphs, basemapStyle, fallbackStyle, isDarkBasemap } from "./basemaps";
import {
  activeBasemap,
  clusterRadius,
  clustersOn,
  heatmapOn,
  pointsOn,
  renderMode,
  resolveMapOptions,
} from "./mapConfig";
import {
  circleRing,
  formatArea,
  formatDistance,
  formatDuration,
  haversine,
  pathLength,
  pointInCircle,
  pointInPolygon,
  polygonArea,
  type LngLat,
} from "./geomath";
import { makeGeocodeProvider, makeRouteProvider, type RouteResult } from "./geocode";
import { spiderfyLayout, type SpiderOffset } from "./spiderfy";
import { BasemapSwitcher, DrawTools, LayersPanel, Legend, MapSearch, ReadoutChips, type SearchHit } from "./overlays";

/* MapView — records on a free vector/raster basemap, taken to Google-Maps depth:
   a basemap switcher (streets/light/dark/satellite/terrain), layer toggles
   (points · clustering with a radius control · heatmap), color- and size-by-field
   markers with a legend, draw/measure tools (distance · area · radius) that
   filter records by the drawn shape, search + geocode, route between records, and
   click-to-add a record at a location. Every capability is config-composable
   (mapConfig.ts) with a sensible default; all chrome is token-themed (map.css),
   light+dark, mobile. GL paint can't read CSS vars, so colors resolve to literals
   at mount and re-resolve on theme/skin change (tokens/resolve). Tiles unreachable
   (offline/CI) → a token-only fallback canvas keeps every overlay working. */

const SOURCE_ID = "map-records";
const HEAT_ID = "map-heat";
const DRAW_ID = "map-draw";
const DOM_MARKER_CAP = 400; // above this, un-clustered points render on the GPU

type Shape =
  | { kind: "line"; points: LngLat[] }
  | { kind: "polygon"; points: LngLat[] }
  | { kind: "circle"; center: LngLat; radiusM: number };

const ll = (e: MapLayerMouseEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];

function MapView({ object, rows, readOnly, viewConfig, viewState, onViewState, onOpen, onCreateDraft }: ViewProps) {
  const opts = React.useMemo(() => resolveMapOptions(object, viewConfig), [object, viewConfig]);
  const isMobile = useIsMobile();

  const latKey = opts.latField;
  const lngKey = opts.lngField;
  const colorKey = opts.colorField;
  const sizeKey = opts.sizeField;
  const weightKey = opts.heatmap.weightField;
  const colorField = colorKey ? object.fields.find((f) => f.key === colorKey) : undefined;
  const sizeField = sizeKey ? object.fields.find((f) => f.key === sizeKey) : undefined;
  const titleField =
    (opts.titleField ? object.fields.find((f) => f.key === opts.titleField) : undefined) ??
    object.fields.find((f) => f.primary) ??
    object.fields[0];

  const { located, withoutLocation } = React.useMemo(() => splitRows(rows, latKey, lngKey), [rows, latKey, lngKey]);

  /* ── draw / measure shape (one at a time, Google-Maps style) ── */
  const [drawMode, setDrawMode] = React.useState<"line" | "polygon" | "circle" | null>(null);
  const [draft, setDraft] = React.useState<LngLat[]>([]);
  const [hover, setHover] = React.useState<LngLat | null>(null);
  const [shape, setShape] = React.useState<Shape | null>(null);

  /* the drawn polygon/circle, when filter-by-area is on, narrows what's plotted */
  const areaShape = opts.tools.filterByArea && shape && shape.kind !== "line" ? shape : null;
  const visibleLocated = React.useMemo<LocatedRow[]>(() => {
    if (!areaShape) return located;
    return located.filter(({ lat, lng }) =>
      areaShape.kind === "circle"
        ? pointInCircle([lng, lat], areaShape.center, areaShape.radiusM)
        : pointInPolygon([lng, lat], areaShape.points),
    );
  }, [located, areaShape]);

  const mode = renderMode(opts, viewState, visibleLocated.length);
  const clusRadius = clusterRadius(opts, viewState);
  const clusterRender = mode.clusters;
  const domRender = mode.points && !clusterRender && visibleLocated.length <= DOM_MARKER_CAP;
  const glPointRender = mode.points && !clusterRender && visibleLocated.length > DOM_MARKER_CAP;
  const dataMode = clusterRender ? "cluster" : domRender ? "markers" : glPointRender ? "points" : mode.heatmap ? "heatmap" : "hidden";

  /* ── GL paint literals — token-resolved, live on theme/skin flips ── */
  const optionColors = React.useMemo(() => {
    const names = new Set<string>();
    for (const o of colorField?.options ?? []) {
      const c = normalizeOption(o).color;
      if (c) names.add(`nx-opt-${c}`);
    }
    return [...names];
  }, [colorField]);
  const colors = useTokenColors([
    "nx-accent",
    "nx-accent-fg",
    "nx-bg-raised",
    "nx-bg-sunken",
    "nx-border",
    "nx-opt-blue",
    "nx-opt-teal",
    "nx-opt-yellow",
    "nx-opt-orange",
    "nx-opt-red",
    ...optionColors,
  ]);
  const accent = colors["nx-accent"] || "rgba(79, 70, 229, 1)";
  const accentFg = colors["nx-accent-fg"] || "rgba(255, 255, 255, 1)";
  const surface = colors["nx-bg-raised"] || "rgba(255, 255, 255, 1)";

  /* ── basemap ── */
  const basemap = activeBasemap(opts, viewState);
  const [styleFailed, setStyleFailed] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const loadedRef = React.useRef(false);
  /* re-arm the offline-detect timer whenever the basemap changes */
  React.useEffect(() => {
    loadedRef.current = false;
    setStyleFailed(false);
    const t = setTimeout(() => {
      if (!loadedRef.current) setStyleFailed(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [basemap]);
  const mapStyle = styleFailed ? fallbackStyle(colors["nx-bg-sunken"]) : basemapStyle(basemap);
  const glyphs = !styleFailed && basemapHasGlyphs(basemap);
  const darkBasemap = !styleFailed && isDarkBasemap(basemap);

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

  /* fit to data ONCE on mount / first rows that carry coords */
  const initialView = React.useMemo(() => {
    const b = boundsOf(located);
    if (!b) return { longitude: 4.6, latitude: 51.2, zoom: 5 };
    if (located.length === 1) return { longitude: located[0].lng, latitude: located[0].lat, zoom: 11 };
    return { bounds: b, fitBoundsOptions: { padding: 64, maxZoom: 12 } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const fittedRef = React.useRef(located.length > 0);
  React.useEffect(() => {
    if (fittedRef.current || located.length === 0) return;
    fittedRef.current = true;
    const b = boundsOf(located);
    if (b) mapRef.current?.fitBounds(b, { padding: 64, maxZoom: 12, duration: reduceMotion ? 0 : 500 });
  }, [located, reduceMotion]);

  /* strip maplibre's generic marker-wrapper semantics (one labeled button per pin) */
  React.useEffect(() => {
    containerRef.current?.querySelectorAll(".maplibregl-marker").forEach((wrap) => {
      wrap.removeAttribute("role");
      wrap.removeAttribute("aria-label");
    });
  }, [visibleLocated, domRender, ready]);

  /* ── popup ── */
  const [popupId, setPopupId] = React.useState<string | null>(null);
  const popupRow = popupId ? located.find((l) => String(l.row.id) === popupId) : undefined;
  React.useEffect(() => {
    if (popupId && !popupRow) setPopupId(null);
  }, [popupId, popupRow]);
  const popupOpenRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (popupRow) popupOpenRef.current?.focus();
  }, [popupRow]);
  const popupFields = React.useMemo(
    () =>
      activeFields(object.fields)
        .filter((f) => !f.primary && f.key !== latKey && f.key !== lngKey && f.key !== titleField.key)
        .slice(0, 2)
        .map((f) => f.key),
    [object.fields, latKey, lngKey, titleField],
  );

  /* ── point / cluster / heatmap sources ── */
  const featureCollection = React.useMemo(
    () => toFeatureCollection(visibleLocated, colorKey, sizeKey, weightKey),
    [visibleLocated, colorKey, sizeKey, weightKey],
  );
  const ext = React.useMemo(() => sizeExtent(visibleLocated, sizeKey), [visibleLocated, sizeKey]);

  const pointColor = React.useMemo(() => {
    if (!colorField) return accent;
    const pairs: string[] = [];
    for (const o of colorField.options ?? []) {
      const meta = normalizeOption(o);
      if (meta.color) pairs.push(meta.value, colors[`nx-opt-${meta.color}`] || accent);
    }
    return pairs.length ? (["match", ["get", "option"], ...pairs, accent] as unknown as string) : accent;
  }, [colorField, colors, accent]);

  const pointRadius = React.useMemo(() => {
    if (!sizeKey || !ext || ext.min === ext.max) return MARKER_DEFAULT_R;
    return ["interpolate", ["linear"], ["coalesce", ["get", "size"], ext.min], ext.min, MARKER_MIN_R, ext.max, MARKER_MAX_R] as unknown as number;
  }, [sizeKey, ext]);

  const weightExt = React.useMemo(() => sizeExtent(visibleLocated, weightKey), [visibleLocated, weightKey]);
  const heatWeight = React.useMemo(() => {
    if (!weightKey || !weightExt || weightExt.min === weightExt.max) return 1;
    return ["interpolate", ["linear"], ["coalesce", ["get", "weight"], weightExt.min], weightExt.min, 0.2, weightExt.max, 1] as unknown as number;
  }, [weightKey, weightExt]);

  /* ── GL state mirrored onto data-attrs (canvas isn't DOM) ── */
  const [clusterCount, setClusterCount] = React.useState(0);
  const [zoomAttr, setZoomAttr] = React.useState<string>("");
  const syncGlState = React.useCallback((map: MaplibreMap) => {
    setZoomAttr(map.getZoom().toFixed(1));
    setClusterCount(map.getLayer("map-clusters") ? map.queryRenderedFeatures(undefined, { layers: ["map-clusters"] }).length : 0);
  }, []);

  /* ── spiderfy: DOM pins that collide on screen fan out onto a ring with leader
     lines. Projected fresh on every settle (zoom/pan changes pixel positions);
     cleared outside DOM-marker mode. ── */
  const [spider, setSpider] = React.useState<Map<string, SpiderOffset>>(new Map());
  const recomputeSpider = React.useCallback(() => {
    const map = mapRef.current;
    if (!map || !domRender) {
      setSpider((s) => (s.size ? new Map() : s));
      return;
    }
    const pts = visibleLocated.map(({ row, lat, lng }) => {
      const p = map.project([lng, lat]);
      return { id: String(row.id), x: p.x, y: p.y };
    });
    setSpider(spiderfyLayout(pts));
  }, [visibleLocated, domRender]);
  React.useEffect(() => {
    if (ready) recomputeSpider();
  }, [ready, recomputeSpider]);

  /* ── search + geocode ── */
  const geocode = React.useMemo(() => makeGeocodeProvider(typeof viewConfig.geocodeEndpoint === "string" ? viewConfig.geocodeEndpoint : undefined), [viewConfig.geocodeEndpoint]);
  const route = React.useMemo(() => makeRouteProvider(typeof viewConfig.routeEndpoint === "string" ? viewConfig.routeEndpoint : undefined), [viewConfig.routeEndpoint]);
  const [query, setQuery] = React.useState("");
  const [geoHits, setGeoHits] = React.useState<SearchHit[]>([]);
  const recordHits = React.useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return located
      .filter((l) => String(l.row[titleField.key] ?? "").toLowerCase().includes(q))
      .slice(0, 6)
      .map((l) => ({ kind: "record" as const, id: String(l.row.id), label: String(l.row[titleField.key] ?? l.row.id), lng: l.lng, lat: l.lat }));
  }, [query, located, titleField]);
  React.useEffect(() => {
    if (!opts.tools.geocode) return setGeoHits([]);
    const q = query.trim();
    if (q.length < 2) return setGeoHits([]);
    let live = true;
    const t = setTimeout(() => {
      geocode(q)
        .then((rs) => live && setGeoHits(rs.map((r, i) => ({ kind: "address" as const, id: `g${i}`, label: r.label, lng: r.lng, lat: r.lat, approximate: r.approximate }))))
        .catch(() => live && setGeoHits([]));
    }, 220);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, geocode, opts.tools.geocode]);
  const searchHits = [...recordHits, ...geoHits];
  const [searchMarker, setSearchMarker] = React.useState<{ lng: number; lat: number; label: string } | null>(null);

  const flyTo = React.useCallback(
    (lng: number, lat: number, zoom = 13) => mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: reduceMotion ? 0 : 700 }),
    [reduceMotion],
  );
  const pickSearch = (h: SearchHit) => {
    setQuery("");
    setGeoHits([]);
    flyTo(h.lng, h.lat, h.kind === "record" ? 13 : 12);
    if (h.kind === "record") {
      setSearchMarker(null);
      setPopupId(h.id);
    } else {
      setSearchMarker({ lng: h.lng, lat: h.lat, label: h.label });
    }
  };

  /* ── route between records ── */
  const [routeOn, setRouteOn] = React.useState(false);
  const [routeSel, setRouteSel] = React.useState<LngLat[]>([]);
  const [routeResult, setRouteResult] = React.useState<RouteResult | null>(null);
  const addWaypoint = React.useCallback(
    (pt: LngLat) => {
      setRouteSel((sel) => {
        const next = [...sel, pt];
        if (next.length >= 2) {
          route(next.slice(-2)).then(setRouteResult).catch(() => setRouteResult(null));
          setRouteOn(false);
          return [];
        }
        return next;
      });
    },
    [route],
  );
  const clearRoute = () => {
    setRouteResult(null);
    setRouteSel([]);
    setRouteOn(false);
  };

  /* ── add point ── */
  const [addPointOn, setAddPointOn] = React.useState(false);
  const canAddPoint = opts.tools.addPoint && !readOnly && !!onCreateDraft;

  /* ── draw handlers ── */
  const clearDraw = () => {
    setShape(null);
    setDraft([]);
    setHover(null);
    setDrawMode(null);
  };
  const commitDraw = React.useCallback(() => {
    if (drawMode === "line" && draft.length >= 2) setShape({ kind: "line", points: draft });
    else if (drawMode === "polygon" && draft.length >= 3) setShape({ kind: "polygon", points: draft });
    setDraft([]);
    setHover(null);
    setDrawMode(null);
  }, [drawMode, draft]);

  const onMapClick = React.useCallback(
    (e: MapLayerMouseEvent) => {
      const pt = ll(e);
      // draw modes consume the click
      if (drawMode === "line" || drawMode === "polygon") {
        setDraft((d) => [...d, pt]);
        return;
      }
      if (drawMode === "circle") {
        if (draft.length === 0) setDraft([pt]);
        else {
          const center = draft[0];
          setShape({ kind: "circle", center, radiusM: Math.max(1, haversine(center, pt)) });
          setDraft([]);
          setHover(null);
          setDrawMode(null);
        }
        return;
      }
      if (addPointOn && onCreateDraft) {
        onCreateDraft({ [latKey]: Number(pt[1].toFixed(6)), [lngKey]: Number(pt[0].toFixed(6)) });
        setAddPointOn(false);
        return;
      }
      // feature click (cluster expand / point → popup or route waypoint)
      const feature = e.features?.[0];
      if (!feature) {
        setPopupId(null);
        return;
      }
      const props = feature.properties as Record<string, unknown>;
      if (props.cluster) {
        const src = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        src?.getClusterExpansionZoom(Number(props.cluster_id)).then((zoom) => {
          mapRef.current?.easeTo({ center: [lng, lat], zoom, duration: reduceMotion ? 0 : 500 });
        });
        return;
      }
      if (props.id != null) {
        if (routeOn) addWaypoint(pt);
        else setPopupId(String(props.id));
      }
    },
    [drawMode, draft, addPointOn, onCreateDraft, latKey, lngKey, routeOn, addWaypoint, reduceMotion],
  );

  const onMapDblClick = React.useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawMode === "line" || drawMode === "polygon") {
        e.preventDefault?.();
        commitDraw();
      }
    },
    [drawMode, commitDraw],
  );
  const onMapMove = React.useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawMode && (draft.length > 0 || drawMode !== "circle")) setHover(ll(e));
    },
    [drawMode, draft.length],
  );

  const [cursor, setCursor] = React.useState<string>();
  const drawing = drawMode !== null;
  const effectiveCursor = drawing || addPointOn || routeOn ? "crosshair" : cursor;

  /* ── draw GeoJSON (committed shape + live draft preview) ── */
  const drawFC = React.useMemo(() => {
    const feats: GeoJSON.Feature[] = [];
    const line = (coords: LngLat[], d: boolean) => feats.push({ type: "Feature", properties: { draft: d }, geometry: { type: "LineString", coordinates: coords } });
    const poly = (ring: LngLat[], d: boolean) => feats.push({ type: "Feature", properties: { draft: d }, geometry: { type: "Polygon", coordinates: [ring] } });
    const pts = (coords: LngLat[]) => coords.forEach((c) => feats.push({ type: "Feature", properties: { draft: true }, geometry: { type: "Point", coordinates: c } }));
    if (shape) {
      if (shape.kind === "line") line(shape.points, false);
      else if (shape.kind === "polygon") poly([...shape.points, shape.points[0]], false);
      else poly(circleRing(shape.center, shape.radiusM), false);
    }
    if (drawMode === "line" && draft.length) {
      line(hover ? [...draft, hover] : draft, true);
      pts(draft);
    }
    if (drawMode === "polygon" && draft.length) {
      line(hover ? [...draft, hover] : draft, true);
      pts(draft);
    }
    if (drawMode === "circle" && draft.length === 1 && hover) {
      poly(circleRing(draft[0], Math.max(1, haversine(draft[0], hover))), true);
      pts(draft);
    }
    return { type: "FeatureCollection" as const, features: feats };
  }, [shape, drawMode, draft, hover]);
  const hasDraw = shape !== null || draft.length > 0;

  /* readouts */
  const measureText =
    shape?.kind === "line" ? formatDistance(pathLength(shape.points)) : drawMode === "line" && draft.length >= 2 ? formatDistance(pathLength(hover ? [...draft, hover] : draft)) : undefined;
  const areaText =
    shape?.kind === "polygon"
      ? formatArea(polygonArea(shape.points))
      : shape?.kind === "circle"
        ? `${formatArea(Math.PI * shape.radiusM ** 2)} · r ${formatDistance(shape.radiusM)}`
        : undefined;
  const inArea = areaShape ? { count: visibleLocated.length, total: located.length } : null;
  const routeText = routeResult ? `${formatDistance(routeResult.distanceM)} · ${formatDuration(routeResult.durationS)}${routeResult.approximate ? " · est." : ""}` : undefined;
  const drawHint = drawing
    ? drawMode === "circle"
      ? draft.length === 0
        ? "Click to set the centre"
        : "Click to set the radius"
      : `Click to add points · double-click to finish${draft.length ? "" : ""}`
    : addPointOn
      ? "Click the map to place a new record"
      : routeOn
        ? routeSel.length === 0
          ? "Click a record to start the route"
          : "Click a second record"
        : undefined;

  const interactiveLayerIds = clusterRender ? ["map-clusters", "map-point"] : glPointRender ? ["map-point-plain"] : undefined;

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
      data-map-mode={dataMode}
      data-map-ready={ready ? "1" : "0"}
      data-map-clusters={clusterCount}
      data-map-zoom={zoomAttr}
      data-map-tiles={styleFailed ? "fallback" : "remote"}
      data-map-basemap={basemap}
      data-map-points={mode.points ? "1" : "0"}
      data-map-heatmap={mode.heatmap ? "1" : "0"}
      data-map-clusterradius={clusRadius}
      data-map-drawmode={drawMode ?? ""}
      data-map-measure={measureText ?? ""}
      data-map-area={shape?.kind === "polygon" || shape?.kind === "circle" ? "1" : ""}
      data-map-inarea={inArea ? inArea.count : ""}
      data-map-route={routeResult ? Math.round(routeResult.distanceM) : ""}
      data-map-dark={darkBasemap ? "1" : "0"}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        if (drawing) {
          e.stopPropagation();
          setDraft([]);
          setHover(null);
          setDrawMode(null);
        } else if (addPointOn || routeOn) {
          e.stopPropagation();
          setAddPointOn(false);
          setRouteOn(false);
          setRouteSel([]);
        } else if (popupId) {
          e.stopPropagation();
          setPopupId(null);
        }
      }}
    >
      <MapGL
        ref={mapRef}
        initialViewState={initialView}
        mapStyle={mapStyle}
        interactiveLayerIds={interactiveLayerIds}
        cursor={effectiveCursor}
        doubleClickZoom={!drawing}
        onClick={onMapClick}
        onDblClick={onMapDblClick}
        onMouseMove={onMapMove}
        onMouseEnter={() => !drawing && setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        onLoad={(e) => {
          loadedRef.current = true;
          setReady(true);
          syncGlState(e.target);
        }}
        onError={() => {
          if (!loadedRef.current) setStyleFailed(true);
        }}
        onIdle={(e) => {
          syncGlState(e.target);
          recomputeSpider();
        }}
        onZoomEnd={(e) => setZoomAttr(e.target.getZoom().toFixed(1))}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={!isMobile} />
        {opts.controls.fullscreen && !isMobile && <FullscreenControl position="top-right" />}
        {opts.controls.geolocate && <GeolocateControl position="top-right" />}
        {opts.controls.scale && <ScaleControl position="bottom-right" unit="metric" />}

        {/* heatmap (independent, un-clustered source) */}
        {mode.heatmap && (
          <Source id={HEAT_ID} type="geojson" data={featureCollection}>
            <Layer
              id="map-heatmap"
              type="heatmap"
              paint={{
                "heatmap-weight": heatWeight,
                "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 12, 1.6],
                "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 12, 28],
                "heatmap-opacity": 0.78,
                "heatmap-color": [
                  "interpolate",
                  ["linear"],
                  ["heatmap-density"],
                  0,
                  "rgba(0,0,0,0)",
                  0.2,
                  colors["nx-opt-blue"] || "#4f7cff",
                  0.45,
                  colors["nx-opt-teal"] || "#2bb3a3",
                  0.7,
                  colors["nx-opt-yellow"] || "#f5c542",
                  0.9,
                  colors["nx-opt-orange"] || "#f08a24",
                  1,
                  colors["nx-opt-red"] || "#e0483a",
                ],
              }}
            />
          </Source>
        )}

        {/* clustered points */}
        {clusterRender && (
          <Source id={SOURCE_ID} type="geojson" data={featureCollection} cluster clusterMaxZoom={14} clusterRadius={clusRadius}>
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
            {glyphs && (
              <Layer id="map-cluster-count" type="symbol" filter={["has", "point_count"]} layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12 }} paint={{ "text-color": accentFg }} />
            )}
            <Layer
              id="map-point"
              type="circle"
              filter={["!", ["has", "point_count"]]}
              paint={{ "circle-color": pointColor, "circle-radius": pointRadius, "circle-stroke-width": 1.5, "circle-stroke-color": surface }}
            />
          </Source>
        )}

        {/* un-clustered GL points (clusters off on a large set) */}
        {glPointRender && (
          <Source id={SOURCE_ID} type="geojson" data={featureCollection}>
            <Layer id="map-point-plain" type="circle" paint={{ "circle-color": pointColor, "circle-radius": pointRadius, "circle-stroke-width": 1.5, "circle-stroke-color": surface }} />
          </Source>
        )}

        {/* DOM markers (few points): real, keyboard-focusable, color + size by field */}
        {domRender &&
          visibleLocated.map(({ row, lat, lng }) => {
            const title = String(row[titleField.key] ?? row.id);
            const tint = colorField ? optionMeta(colorField, row[colorKey ?? ""]).color : undefined;
            // size-by-field on a TIGHT range (0.82–1.32) so big values don't produce
            // giant colliding pins — the legend still conveys the field
            const sv = sizeKey ? numericValue(row[sizeKey]) : undefined;
            const scale =
              sizeKey && ext && sv !== undefined && ext.max > ext.min
                ? 0.82 + 0.5 * Math.max(0, Math.min(1, (sv - ext.min) / (ext.max - ext.min)))
                : 1;
            const off = spider.get(String(row.id));
            const dx = off?.dx ?? 0;
            const dy = off?.dy ?? 0;
            return (
              <Marker key={String(row.id)} longitude={lng} latitude={lat} anchor="bottom">
                <div className="nxMapPinCell">
                  {off?.spread && (
                    <svg className="nxMapLeader" width="0" height="0" overflow="visible" aria-hidden="true">
                      <line x1="0" y1="0" x2={dx.toFixed(1)} y2={dy.toFixed(1)} />
                      <circle cx="0" cy="0" r="2.5" />
                    </svg>
                  )}
                  <div className="nxMapPinOffset" style={{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }}>
                    <button
                      type="button"
                      className="nxMapPin"
                      data-testid={`map-marker-${row.id}`}
                      aria-label={title}
                      style={{ ...(tint ? { "--pin-color": `var(--nx-opt-${tint})` } : {}), "--pin-scale": scale } as React.CSSProperties}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (routeOn) addWaypoint([lng, lat]);
                        else setPopupId(String(row.id));
                      }}
                    >
                      <svg width="24" height="29" viewBox="0 0 26 31" aria-hidden="true">
                        <path d="M13 1C6.4 1 1 6.3 1 12.8 1 21.3 13 30 13 30s12-8.7 12-17.2C25 6.3 19.6 1 13 1Z" fill="currentColor" stroke="var(--nx-bg-raised)" strokeWidth="1.5" />
                        <circle cx="13" cy="12.6" r="4.6" fill="var(--nx-bg-raised)" />
                      </svg>
                    </button>
                  </div>
                </div>
              </Marker>
            );
          })}

        {/* route line */}
        {routeResult && (
          <Source id="map-route" type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeResult.coordinates } }}>
            <Layer id="map-route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 4, "line-opacity": 0.85, "line-dasharray": [1, 0.6] }} />
          </Source>
        )}

        {/* draw + measure shapes (committed solid, draft dashed — dasharray/opacity
            can't be feature-driven in maplibre, so the draft/committed split is by
            filter into separate constant-paint layers) */}
        {(shape || draft.length > 0) && (
          <Source id={DRAW_ID} type="geojson" data={drawFC}>
            <Layer id="map-draw-fill" type="fill" filter={["==", ["geometry-type"], "Polygon"]} paint={{ "fill-color": accent, "fill-opacity": 0.12 }} />
            <Layer id="map-draw-line" type="line" filter={["!", ["get", "draft"]]} paint={{ "line-color": accent, "line-width": 2.5 }} />
            <Layer id="map-draw-line-draft" type="line" filter={["get", "draft"]} paint={{ "line-color": accent, "line-width": 2, "line-dasharray": [2, 1.5] }} />
            <Layer id="map-draw-vertex" type="circle" filter={["==", ["geometry-type"], "Point"]} paint={{ "circle-radius": 4, "circle-color": surface, "circle-stroke-color": accent, "circle-stroke-width": 2 }} />
          </Source>
        )}

        {searchMarker && (
          <Marker longitude={searchMarker.lng} latitude={searchMarker.lat} anchor="bottom">
            <span className="nxMapSearchPin" data-testid="map-search-pin" title={searchMarker.label} aria-label={searchMarker.label} />
          </Marker>
        )}

        {routeSel.map((p, i) => (
          <Marker key={`rs${i}`} longitude={p[0]} latitude={p[1]} anchor="center">
            <span className="nxMapRoutePin" aria-hidden />
          </Marker>
        ))}

        {popupRow && (
          <Popup longitude={popupRow.lng} latitude={popupRow.lat} anchor="bottom" offset={clusterRender ? 12 : 30} maxWidth="280px" className="nxMapPopup" closeButton={false} onClose={() => setPopupId(null)}>
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

      {/* ── chrome overlays ── */}
      <div className="nxMapTopLeft">
        <MapSearch query={query} onQuery={setQuery} hits={searchHits} onPick={pickSearch} onClear={() => { setQuery(""); setGeoHits([]); setSearchMarker(null); }} geocodeEnabled={opts.tools.geocode} />
        <div className="nxMapControlsRow">
          <BasemapSwitcher offered={opts.basemaps} active={basemap} onPick={(id) => onViewState({ mapBasemap: id })} />
          <LayersPanel
          open={typeof viewState.mapLayersOpen === "boolean" ? viewState.mapLayersOpen : false}
          onOpenChange={(v) => onViewState({ mapLayersOpen: v })}
          points={pointsOn(viewState)}
          clusters={clustersOn(opts, viewState)}
          heatmap={heatmapOn(opts, viewState)}
          heatmapOffered
          clusterRadius={clusRadius}
          colorFieldLabel={colorField?.label}
          sizeFieldLabel={sizeField?.label}
            onToggle={(layer, on) => onViewState({ [layer === "points" ? "mapPoints" : layer === "clusters" ? "mapClusters" : "mapHeatmap"]: on })}
            onRadius={(r) => onViewState({ clusterRadius: r })}
          />
        </div>
      </div>

      {(opts.tools.draw || canAddPoint || opts.tools.route) && (
        <div className="nxMapLeftRail">
          <DrawTools
            drawMode={drawMode}
            onDraw={(m) => { setDraft([]); setHover(null); setDrawMode(m); }}
            hasShapes={hasDraw}
            onClear={clearDraw}
            drawEnabled={opts.tools.draw}
            addPointEnabled={canAddPoint}
            addPointOn={addPointOn}
            onAddPoint={(on) => { setAddPointOn(on); if (on) { setDrawMode(null); setRouteOn(false); } }}
            routeEnabled={opts.tools.route}
            routeOn={routeOn}
            onRoute={(on) => { setRouteOn(on); setRouteSel([]); if (on) { setDrawMode(null); setAddPointOn(false); } }}
          />
        </div>
      )}

      {drawing && (draft.length > 0 || drawMode === "circle") && (
        <div className="nxMapDrawActions">
          {(drawMode === "line" || drawMode === "polygon") && draft.length >= (drawMode === "line" ? 2 : 3) && (
            <Button size="sm" variant="primary" data-testid="map-draw-finish" onClick={commitDraw}>Finish</Button>
          )}
          <Button size="sm" variant="secondary" data-testid="map-draw-cancel" onClick={() => { setDraft([]); setHover(null); setDrawMode(null); }}>Cancel</Button>
        </div>
      )}

      {opts.legend && <Legend colorField={colorField} sizeFieldLabel={sizeField?.label} sizeExtent={ext} />}

      <ReadoutChips
        drawHint={drawHint}
        measure={measureText}
        area={areaText}
        inArea={inArea}
        onClearArea={clearDraw}
        route={routeText}
        onClearRoute={clearRoute}
      />

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
