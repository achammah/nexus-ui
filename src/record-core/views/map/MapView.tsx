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
import { Navigation, ArrowRight, HelpCircle, MapPinPlus, ZoomIn, Box } from "lucide-react";
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
  sizeExtent,
  splitRows,
  toFeatureCollection,
  type LocatedRow,
} from "./geo";
import { BASEMAP_LABELS, basemapHasGlyphs, basemapIsVector, basemapProbeUrl, basemapStyle, fallbackStyle, isDarkBasemap, type BasemapId } from "./basemaps";
import {
  activeBasemap,
  buildings3dOn,
  clusterRadius,
  clustersOn,
  heatmapOn,
  hillshadeOn,
  mapProjection,
  pointsOn,
  renderMode,
  resolveMapOptions,
  routeProfile,
} from "./mapConfig";
import {
  circleRing,
  formatArea,
  formatAreaRaw,
  ringPerimeter,
  centroid,
  formatDistance,
  pathLength,
  haversine,
  pointInCircle,
  pointInPolygon,
  polygonArea,
  type LngLat,
} from "./geomath";
import { makeGeocodeProvider, makeReverseGeocoder, type GeocodeResult } from "./geocode";
import { makeRouter, moveStop, stopLabel, type Profile, type RouteResult } from "./routing";
import { applyAugments, applySky, flyToPoint, viewportRing, zoomAroundPoint } from "./camera";
import { spiderfyLayout, type SpiderOffset } from "./spiderfy";
import { DrawTools, LayersPanel, Legend, MapSearch, MapTypeMenu, ReadoutChips, type SearchHit } from "./overlays";
import { MapContextMenu, type ContextItem } from "./ContextMenu";
import { ItineraryPanel, type Stop, type PlaceHit } from "./ItineraryPanel";
import { Minimap } from "./Minimap";

/* MapView — records on a free vector/raster basemap, taken to Google-Maps depth:
   six map TYPES (streets/light/dark/satellite/hybrid/terrain) with a crossfade on
   switch + 3D-building extrusions and shaded relief; a real CAMERA feel (eased
   fly/zoom, double-click zoom toward the cursor, drag-tilt/rotate with a compass);
   multi-stop ROUTING with turn-by-turn directions (OSRM demo, mock fallback); rich
   INTERACTIONS (marker popups with directions, a right-click context menu, address
   search + reverse-geocode, geolocate, cluster spiderfy); and polish (minimap inset,
   scale, fullscreen, draw/measure, filter-by-area). Every capability is
   config-composable (mapConfig.ts) with a sensible default; all chrome is token-
   themed (map.css), light+dark, mobile. GL paint can't read CSS vars, so colors
   resolve to literals at mount and re-resolve on theme/skin change (tokens/resolve).
   Tiles unreachable (offline/CI) → a token-only fallback canvas keeps every overlay
   working. */

const SOURCE_ID = "map-records";
const HEAT_ID = "map-heat";
const DRAW_ID = "map-draw";
const DOM_MARKER_CAP = 400; // above this, un-clustered points render on the GPU
const DECLUTTER_ZOOM = 9; // below this zoom, a dense un-clustered set also goes GPU (no teardrop wall)
const CLUSTER_MAX_ZOOM = 14;

/* luminance test on a resolved token color (rgb/rgba/hex) — used to read the app
   theme off the live --nx-bg value so the globe atmosphere tracks light vs dark */
function isDarkColor(c: string | undefined): boolean {
  if (!c) return false;
  let r = 0, g = 0, b = 0;
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) { r = +m[1]; g = +m[2]; b = +m[3]; }
  else {
    const h = c.replace("#", "").trim();
    const hex = h.length === 3 ? h.split("").map((x) => x + x).join("") : h;
    if (hex.length < 6) return false;
    r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16);
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

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
  const rowById = React.useCallback((id: string) => located.find((l) => String(l.row.id) === id), [located]);

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
  /* declutter guard: even with clustering toggled off, a dense set on a wide
     (zoomed-out) frame renders as compact GPU dots — DOM teardrops only when
     the count is modest or the camera is close enough for pins to separate */
  const [zoomAttr, setZoomAttr] = React.useState<string>("");
  const [pitchAttr, setPitchAttr] = React.useState(0);
  const zoomNow = zoomAttr ? Number.parseFloat(zoomAttr) : NaN;
  const denseWide =
    visibleLocated.length > DOM_MARKER_CAP ||
    (visibleLocated.length > opts.clustering.threshold && !(zoomNow >= DECLUTTER_ZOOM));
  const domRender = mode.points && !clusterRender && !denseWide;
  const glPointRender = mode.points && !clusterRender && denseWide;
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
    "nx-bg",
    "nx-bg-raised",
    "nx-bg-sunken",
    "nx-border",
    "nx-border-strong",
    "nx-fg-muted",
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
  const buildingColor = colors["nx-border-strong"] || "#c8c6c1";
  // the globe atmosphere follows the APP THEME (not the basemap): light theme →
  // a light sky/halo, dark theme → dark space. Re-resolves whenever the theme
  // flips (useTokenColors re-runs), so the sphere never keeps a stale-theme sky.
  const appDark = isDarkColor(colors["nx-bg"]);

  /* ── basemap + tile-load robustness ─────────────────────────────────────────
     A basemap swap must never leave a blank canvas. The last-good basemap is
     remembered; when a new style/tiles fail to load, we retry with backoff and then
     REVERT to the last-good basemap with a visible retry chip. The token-only canvas
     is reserved for a genuine offline FIRST load (no good basemap yet). Rapid/mid-load
     switches are safe: the attempt re-arms per basemap, latest selection wins. ── */
  const basemap = activeBasemap(opts, viewState);
  const vectorActive = basemapIsVector(basemap);
  const [styleFailed, setStyleFailed] = React.useState(false); // genuine offline → token canvas
  const [tileWarn, setTileWarn] = React.useState<{ failed: BasemapId; kept: BasemapId; retrying?: boolean } | null>(null);
  const [styleNonce, setStyleNonce] = React.useState(0); // bump forces a style re-fetch (retry)
  const [switching, setSwitching] = React.useState(false); // crossfade dip during a swap
  const [ready, setReady] = React.useState(false);
  const loadedRef = React.useRef(false);
  const lastGoodRef = React.useRef<BasemapId | null>(null);
  const retryRef = React.useRef(0);
  const timersRef = React.useRef<{ watchdog?: ReturnType<typeof setTimeout>; fail?: ReturnType<typeof setTimeout>; recover?: ReturnType<typeof setTimeout> }>({});
  const MAX_STYLE_RETRIES = 2;
  const MAX_RECOVERY_ATTEMPTS = 3; // background re-tries of the basemap the USER chose
  const recoverRef = React.useRef<{ want: BasemapId; attempts: number } | null>(null);
  // assigned once augments are known (below); lets succeed apply them without an
  // ordering cycle (the basemap block sits above the augments block)
  const applyAugmentsRef = React.useRef<(m: MaplibreMap) => void>(() => {});

  const succeed = React.useCallback(
    (map: MaplibreMap) => {
      loadedRef.current = true;
      retryRef.current = 0;
      lastGoodRef.current = basemap;
      clearTimeout(timersRef.current.watchdog);
      clearTimeout(timersRef.current.fail);
      setStyleFailed(false);
      applyAugmentsRef.current(map);
    },
    [basemap],
  );

  /* retry-then-revert; never touches loadedRef so a load that lands mid-retry wins */
  const evaluateFailure = React.useCallback(() => {
    if (loadedRef.current) return;
    if (retryRef.current < MAX_STYLE_RETRIES) {
      retryRef.current += 1;
      setStyleNonce((n) => n + 1); // re-fetch the style (re-requests its tiles)
      return;
    }
    const good = lastGoodRef.current;
    if (good && good !== basemap) {
      setSwitching(false);
      // Keep the last working map visible, but DON'T abandon the user's choice —
      // remember it and probe for it in the background (scheduleRecovery), so a
      // transient hiccup ends with them on the style they picked, not parked on
      // the fallback. The hard "unavailable · Retry" chip only appears once the
      // background attempts are exhausted.
      recoverRef.current = { want: basemap, attempts: 0 };
      setTileWarn({ failed: basemap, kept: good, retrying: true });
      onViewState({ mapBasemap: good, mapTypeOpen: false }); // keep the last working map, never blank
    } else {
      setStyleFailed(true); // first-load offline (no good basemap yet)
    }
  }, [basemap, onViewState]);
  /* debounce a burst of tile errors into one failure verdict */
  const scheduleFailure = React.useCallback(() => {
    if (loadedRef.current) return;
    clearTimeout(timersRef.current.fail);
    timersRef.current.fail = setTimeout(evaluateFailure, 900);
  }, [evaluateFailure]);

  React.useEffect(() => {
    retryRef.current = 0; // a NEW basemap gets a fresh retry budget (nonce retries keep theirs)
  }, [basemap]);

  /* Background recovery of the basemap the USER chose. While the last-good style
     stays on screen, probe the failed one with backoff; the moment it answers,
     re-apply it. Only when the attempts are exhausted does the chip harden into
     "unavailable · Retry". A fresh user pick cancels any pending recovery. */
  React.useEffect(() => {
    const pending = recoverRef.current;
    if (!pending || basemap !== tileWarn?.kept) return;
    const delay = [4000, 10000, 20000][pending.attempts] ?? 20000;
    timersRef.current.recover = setTimeout(async () => {
      const cur = recoverRef.current;
      if (!cur) return;
      let alive = false;
      try {
        const r = await fetch(basemapProbeUrl(cur.want), { method: "GET", cache: "no-store" });
        alive = r.ok;
      } catch {
        alive = false; // network still down
      }
      if (!recoverRef.current) return; // a user pick superseded us
      if (alive) {
        recoverRef.current = null;
        setTileWarn(null);
        onViewState({ mapBasemap: cur.want }); // land the user on what they picked
        return;
      }
      cur.attempts += 1;
      if (cur.attempts >= MAX_RECOVERY_ATTEMPTS) {
        recoverRef.current = null;
        setTileWarn((w) => (w ? { ...w, retrying: false } : w)); // harden to the manual chip
      } else {
        setTileWarn((w) => (w ? { ...w } : w)); // re-run this effect for the next backoff step
      }
    }, delay);
    return () => clearTimeout(timersRef.current.recover);
  }, [basemap, tileWarn, onViewState]);
  React.useEffect(() => {
    loadedRef.current = false;
    setStyleFailed(false);
    clearTimeout(timersRef.current.watchdog);
    clearTimeout(timersRef.current.fail);
    timersRef.current.watchdog = setTimeout(evaluateFailure, 6000); // silent stall (no error event)
    return () => {
      clearTimeout(timersRef.current.watchdog);
      clearTimeout(timersRef.current.fail);
    };
  }, [basemap, styleNonce, evaluateFailure]);

  const rawStyle = styleFailed ? fallbackStyle(colors["nx-bg-sunken"]) : basemapStyle(basemap);
  const mapStyle = React.useMemo(() => {
    if (styleFailed || styleNonce === 0) return rawStyle;
    // cache-bust so react-map-gl actually re-sets the style on a retry
    if (typeof rawStyle === "string") return `${rawStyle}${rawStyle.includes("?") ? "&" : "?"}_r=${styleNonce}`;
    return { ...rawStyle, metadata: { ...(rawStyle as { metadata?: Record<string, unknown> }).metadata, _r: styleNonce } };
  }, [rawStyle, styleNonce, styleFailed]);
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

  /* ── 3D augments (buildings · hillshade · optional DEM terrain) — re-applied on
     every style load, since setStyle wipes custom layers ── */
  const buildings3d = buildings3dOn(opts, viewState);
  const hillshade = hillshadeOn(opts, viewState);
  const augments = React.useMemo(
    () => ({
      buildings3d: buildings3d && vectorActive && !styleFailed,
      buildingColor,
      hillshade: hillshade && !styleFailed,
      hillshadeOpacity: darkBasemap ? 0.5 : 0.32,
      terrainDemUrl: opts.terrain.demUrl,
      terrainExaggeration: opts.terrain.exaggeration,
    }),
    [buildings3d, vectorActive, styleFailed, buildingColor, hillshade, darkBasemap, opts.terrain.demUrl, opts.terrain.exaggeration],
  );
  /* projection (flat mercator · 3D globe). setStyle can reset it, so it is re-applied
     on every style load (via the ref below), plus a live-toggle effect. */
  const projection = mapProjection(opts, viewState);
  applyAugmentsRef.current = (m: MaplibreMap) => {
    applyAugments(m, augments);
    try {
      m.setProjection({ type: projection === "globe" ? "globe" : "mercator" });
    } catch {
      /* projection unsupported on this build — stays mercator */
    }
    applySky(m, projection === "globe", appDark);
  };
  const applyAll = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && map.isStyleLoaded()) applyAugments(map, augments);
  }, [augments]);
  React.useEffect(() => {
    if (ready) applyAll();
  }, [ready, applyAll]);
  /* live projection toggle (no style reload) */
  React.useEffect(() => {
    const map = mapRef.current?.getMap();
    if (map && ready && map.isStyleLoaded()) {
      try {
        map.setProjection({ type: projection === "globe" ? "globe" : "mercator" });
      } catch {
        /* ignore */
      }
      applySky(map, projection === "globe", appDark);
    }
  }, [projection, ready, appDark]);
  /* Re-assert projection + atmosphere after a basemap swap settles. `setStyle`
     (every basemap switch) RESETS the projection to mercator and wipes the sky;
     the re-apply inside the style-load handler lands too early to stick, so after
     a switch the globe silently flattened to mercator and lost its halo (the
     "globe light/dark is buggy" symptom). onIdle fires once the new style has
     painted — re-assert both there so globe + sky survive every style change. */
  const reassertProjection = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    const want = projection === "globe" ? "globe" : "mercator";
    try {
      if (map.getProjection()?.type !== want) map.setProjection({ type: want });
    } catch {
      /* projection unsupported on this build — stays mercator */
    }
    applySky(map, projection === "globe", appDark);
  }, [projection, appDark]);

  /* ── fly view: trackpad tilt/rotate + a one-click 3D toggle ──
     Trackpad users have no right-mouse drag, so a plain two-finger drag stays
     pan/zoom and ⌥(alt) + two-finger becomes the fly gesture: vertical → PITCH
     (tilt top-down↔oblique), horizontal → BEARING (spin). We intercept the wheel
     in the capture phase and stop it before maplibre's scrollZoom sees it, so the
     two gestures never fight. Desktop mouse still tilts via ctrl/right-drag
     (dragRotate); mobile via two-finger (touchPitch). */
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.altKey) return; // plain scroll → zoom/pan (unchanged)
      const map = mapRef.current?.getMap();
      if (!map) return;
      e.preventDefault();
      e.stopImmediatePropagation(); // keep scrollZoom from also firing
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        map.setBearing(map.getBearing() + e.deltaX * 0.4);
      } else {
        // push up (deltaY<0) tilts toward the horizon; clamp to the config maxPitch
        const next = Math.max(0, Math.min(map.getMaxPitch(), map.getPitch() - e.deltaY * 0.25));
        map.setPitch(next);
      }
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true } as EventListenerOptions);
  }, []);
  /* Turning on a 3D layer must SHOW something. From a top-down camera, extrusions
     collapse to their footprints and relief is invisible, so enabling "3D buildings"
     or "Terrain shading" looked broken. On enable we ease the camera into the pose
     where the layer is actually legible: tilt to an oblique pitch, and for buildings
     also close in to the zoom where the vector tiles carry building geometry (z14+).
     Only ever applied when turning a layer ON, and only for the axes that need it. */
  const revealFor = React.useCallback(
    (kind: "buildings" | "hillshade") => {
      const map = mapRef.current?.getMap();
      if (!map) return;
      const next: { pitch?: number; zoom?: number } = {};
      if (map.getPitch() < 25) next.pitch = Math.min(60, map.getMaxPitch());
      // buildings exist from z14, but most OSM footprints here carry no height tag
      // and fall back to the ~8 m floor — which only reads as real mass from ~z16.
      if (kind === "buildings" && map.getZoom() < 16) next.zoom = 16.2;
      if (!Object.keys(next).length) return; // already in a pose that shows it
      map.easeTo({ ...next, duration: reduceMotion ? 0 : 900, essential: true });
    },
    [reduceMotion],
  );

  /* one-click fly toggle: level (top-down + north) when tilted/rotated, else ease
     into a 3D oblique pose. Works in flat AND globe (tilting a globe orbits it). */
  const flyActive = pitchAttr > 5;
  const toggleFly = React.useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const tilted = map.getPitch() > 5 || Math.abs(map.getBearing()) > 1;
    map.easeTo(
      tilted
        ? { pitch: 0, bearing: 0, duration: reduceMotion ? 0 : 700, essential: true }
        : { pitch: Math.min(60, map.getMaxPitch()), duration: reduceMotion ? 0 : 900, essential: true },
    );
  }, [reduceMotion]);

  /* ── projection ⟂ basemap: two orthogonal axes on ONE merged map view ──
     Projection (flat|globe) is a live toggle that changes ONLY the projection —
     viewport, markers, route, filters and the chosen style all carry across, so
     it never reads as navigating to a different feature. Any of the 6 styles
     renders under either projection. "Earth" is a named PRESET over these axes,
     not a third mode. */
  const setProjection = React.useCallback(
    (mode: "flat" | "globe") => onViewState({ mapProjection: mode }),
    [onViewState],
  );
  const earthBase: BasemapId = opts.basemaps.includes("satellite") ? "satellite" : opts.basemaps.includes("hybrid") ? "hybrid" : basemap;
  // the preset reads as "on" when the live state already matches it (globe + an
  // imagery base + a meaningful tilt) — so it lights up whether reached via the
  // chip or by composing the axes by hand
  const earthActive = projection === "globe" && (basemap === "satellite" || basemap === "hybrid") && pitchAttr > 20;
  const applyEarthPreset = React.useCallback(() => {
    setTileWarn(null);
    if (!reduceMotion && basemap !== earthBase) setSwitching(true);
    // compose the axes: globe projection + imagery style, viewport preserved
    onViewState({ mapProjection: "globe", mapBasemap: earthBase });
    // one coherent move: pull back so the curvature + atmosphere read, tilt toward
    // the horizon — the Google-Earth entry pose (camera only; markers/route stay)
    const m = mapRef.current?.getMap();
    if (m) m.easeTo({ zoom: Math.min(m.getZoom(), 4.6), pitch: 55, duration: reduceMotion ? 0 : 1100, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onViewState, reduceMotion, basemap, earthBase]);

  /* ── basemap crossfade — a soft blur + opacity dip on the canvas while the new
     style loads (switching state declared above), so a switch morphs, not flips ── */
  const pickBasemap = React.useCallback(
    (id: string) => {
      setTileWarn(null); // a fresh user choice clears any prior "kept X" warning
      recoverRef.current = null; // ...and supersedes any background recovery in flight
      if (!reduceMotion && id !== basemap) setSwitching(true);
      onViewState({ mapBasemap: id, mapTypeOpen: false }); // picking a base closes the menu (overlay toggles keep it open)
    },
    [onViewState, reduceMotion, basemap],
  );

  /* fit to data ONCE on mount / first rows that carry coords */
  const initialView = React.useMemo(() => {
    const pose = { pitch: opts.camera.initialPitch, bearing: opts.camera.initialBearing };
    const b = boundsOf(located);
    if (!b) return { longitude: 4.6, latitude: 51.2, zoom: 5, ...pose };
    if (located.length === 1) return { longitude: located[0].lng, latitude: located[0].lat, zoom: 11, ...pose };
    return { bounds: b, fitBoundsOptions: { padding: 64, maxZoom: 12 }, ...pose };
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
  const [bearingAttr, setBearingAttr] = React.useState(0);
  const [overview, setOverview] = React.useState<{ center: { lng: number; lat: number }; zoom: number; ring: LngLat[] } | null>(null);
  const syncGlState = React.useCallback((map: MaplibreMap) => {
    setZoomAttr(map.getZoom().toFixed(1));
    setPitchAttr(Math.round(map.getPitch()));
    setBearingAttr(Math.round(map.getBearing()));
    setClusterCount(map.getLayer("map-clusters") ? map.queryRenderedFeatures(undefined, { layers: ["map-clusters"] }).length : 0);
    if (opts.controls.minimap) {
      const c = map.getCenter();
      setOverview({ center: { lng: c.lng, lat: c.lat }, zoom: map.getZoom(), ring: viewportRing(map) });
    }
  }, [opts.controls.minimap]);

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

  /* ── cluster spiderfy-on-click: a cluster that can't split further fans its
     leaves out as temporary DOM pins ── */
  const [clusterLeaves, setClusterLeaves] = React.useState<{ anchor: LngLat; ids: string[] } | null>(null);
  const clusterLeafOffsets = React.useMemo(() => {
    const map = mapRef.current;
    if (!clusterLeaves || !map) return new Map<string, SpiderOffset>();
    const p = map.project(clusterLeaves.anchor);
    return spiderfyLayout(clusterLeaves.ids.map((id) => ({ id, x: p.x, y: p.y })));
  }, [clusterLeaves]);
  React.useEffect(() => {
    // any camera move dismisses the temporary fan
    setClusterLeaves(null);
  }, [zoomAttr]);

  /* ── search + geocode ── */
  const geocode = React.useMemo(() => makeGeocodeProvider(typeof viewConfig.geocodeEndpoint === "string" ? viewConfig.geocodeEndpoint : undefined), [viewConfig.geocodeEndpoint]);
  const reverse = React.useMemo(() => makeReverseGeocoder(typeof viewConfig.geocodeEndpoint === "string" ? viewConfig.geocodeEndpoint : undefined), [viewConfig.geocodeEndpoint]);
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
    (lng: number, lat: number, zoom = 13) => {
      const map = mapRef.current?.getMap();
      if (map) flyToPoint(map, lng, lat, zoom, reduceMotion);
    },
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

  /* ── itinerary / routing ── */
  const router = React.useMemo(
    () => makeRouter({ endpoint: opts.routing.endpoint, osrmBaseUrl: opts.routing.osrmBaseUrl }),
    [opts.routing.endpoint, opts.routing.osrmBaseUrl],
  );
  const profile = routeProfile(opts, viewState);
  const [itinOpen, setItinOpen] = React.useState(false);
  const [stops, setStops] = React.useState<Stop[]>([]);
  const [routeResult, setRouteResult] = React.useState<RouteResult | null>(null);
  /* which of the engine's routes is chosen: 0 = the primary, 1..n = alternatives.
     Reset whenever a new result arrives so a stale index never selects nothing. */
  const [routeChoice, setRouteChoice] = React.useState(0);
  /* every route the engine offered, primary first — one entry when there are no
     alternatives, which is the honest normal case */
  const routeOptions = React.useMemo<RouteResult[]>(
    () => (routeResult ? [routeResult, ...(routeResult.alternatives ?? [])] : []),
    [routeResult],
  );
  const activeRoute = routeOptions[routeChoice] ?? routeResult;
  React.useEffect(() => { setRouteChoice(0); }, [routeResult]);
  const [routeLoading, setRouteLoading] = React.useState(false);
  const stopSeq = React.useRef(0);
  const stopFromRecord = (l: LocatedRow): Stop => ({ key: `r${l.row.id}`, lng: l.lng, lat: l.lat, label: String(l.row[titleField.key] ?? l.row.id), recordId: String(l.row.id) });
  const stopFromCoord = (lng: number, lat: number, label?: string): Stop => ({ key: `c${stopSeq.current++}`, lng, lat, label: label ?? `Point (${lat.toFixed(3)}, ${lng.toFixed(3)})` });
  /* ── directions: free from/to entry ────────────────────────────────────────
     The A/B fields search the SAME two sources as the map search bar — site
     records first, then geocoded addresses — so an origin/destination can be any
     place, not only a record already on the map. */
  const searchPlaces = React.useCallback(
    async (q: string): Promise<PlaceHit[]> => {
      const needle = q.trim().toLowerCase();
      if (needle.length < 2) return [];
      const recs: PlaceHit[] = located
        .filter((l) => String(l.row[titleField.key] ?? "").toLowerCase().includes(needle))
        .slice(0, 5)
        .map((l) => ({ kind: "record" as const, id: `r${l.row.id}`, label: String(l.row[titleField.key] ?? "Untitled"), lng: l.lng, lat: l.lat }));
      if (!opts.tools.geocode) return recs;
      try {
        const gs = await geocode(q);
        return [...recs, ...gs.slice(0, 5).map((g, i) => ({ kind: "address" as const, id: `g${i}`, label: g.label, lng: g.lng, lat: g.lat }))];
      } catch {
        return recs; // geocoder unreachable — records still work
      }
    },
    [located, titleField.key, opts.tools.geocode, geocode],
  );
  const setStopAt = React.useCallback((i: number, lng: number, lat: number, label: string) => {
    setStops((prev) => {
      const next = [...prev];
      const stop: Stop = { key: next[i]?.key ?? `s${Date.now()}${i}`, lng, lat, label };
      if (i < next.length) next[i] = stop;
      else next.push(stop);
      return next;
    });
  }, []);
  const useMyLocation = React.useCallback(
    (i: number) => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => setStopAt(i, pos.coords.longitude, pos.coords.latitude, "Your location"),
        () => { /* denied/unavailable — the field stays as it was */ },
        { enableHighAccuracy: true, timeout: 8000 },
      );
    },
    [setStopAt],
  );
  const [departAt, setDepartAt] = React.useState("");

  /* an explicit "+ Add stop" arms map-picking even once A and B are set */
  const [wantStop, setWantStop] = React.useState(false);
  const pickingStop = itinOpen && (stops.length < 2 || wantStop);

  const addStop = React.useCallback((s: Stop, at: "start" | "end") => {
    setStops((prev) => {
      const without = prev.filter((p) => p.key !== s.key);
      const next = at === "start" ? [s, ...without] : [...without, s];
      return next;
    });
    setItinOpen(true);
  }, []);
  const openDirectionsFromRecord = (l: LocatedRow, at: "start" | "end") => {
    setPopupId(null);
    addStop(stopFromRecord(l), at);
  };

  /* (re)compute the route whenever the stops or profile change */
  React.useEffect(() => {
    if (stops.length < 2) {
      setRouteResult(null);
      setRouteLoading(false);
      return;
    }
    let live = true;
    setRouteLoading(true);
    router(stops.map((s) => [s.lng, s.lat] as LngLat), profile)
      .then((r) => {
        if (!live) return;
        setRouteResult(r);
        setRouteLoading(false);
        const map = mapRef.current?.getMap();
        if (map) {
          let minLng = 180, minLat = 90, maxLng = -180, maxLat = -90;
          for (const [lng, lat] of r.coordinates) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
          if (r.coordinates.length) map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: { top: 72, bottom: 72, left: isMobile ? 48 : 340, right: 48 }, maxZoom: 15, duration: reduceMotion ? 0 : 700 });
        }
      })
      .catch(() => live && (setRouteResult(null), setRouteLoading(false)));
    return () => {
      live = false;
    };
  }, [stops, profile, router, reduceMotion, isMobile]);

  const clearItinerary = () => {
    setStops([]);
    setRouteResult(null);
  };
  const closeItinerary = () => {
    setItinOpen(false);
    clearItinerary();
  };

  /* ── add point ── */
  const [addPointOn, setAddPointOn] = React.useState(false);
  const canAddPoint = opts.tools.addPoint && !readOnly && !!onCreateDraft;
  const dropRecord = (lng: number, lat: number) => {
    onCreateDraft?.({ [latKey]: Number(lat.toFixed(6)), [lngKey]: Number(lng.toFixed(6)) });
    setAddPointOn(false);
  };

  /* ── context menu ── */
  const [ctx, setCtx] = React.useState<{ x: number; y: number; items: ContextItem[] } | null>(null);
  const closeCtx = () => setCtx(null);
  const [whatsHere, setWhatsHere] = React.useState<GeocodeResult | null>(null);
  const openContext = React.useCallback(
    (x: number, y: number, lng: number, lat: number, record?: LocatedRow) => {
      if (!opts.tools.contextMenu) return;
      const items: ContextItem[] = [];
      if (record) {
        items.push({ id: "open", label: "Open record", icon: <ArrowRight size={15} />, onSelect: () => onOpen(String(record.row.id)) });
        if (opts.tools.route) {
          items.push({ id: "dir-from", label: "Directions from here", icon: <Navigation size={15} />, onSelect: () => openDirectionsFromRecord(record, "start") });
          items.push({ id: "dir-to", label: "Directions to here", icon: <ArrowRight size={15} />, onSelect: () => openDirectionsFromRecord(record, "end") });
        }
      } else {
        if (opts.tools.route) {
          items.push({ id: "dir-from", label: "Directions from here", icon: <Navigation size={15} />, onSelect: () => addStop(stopFromCoord(lng, lat), "start") });
          items.push({ id: "dir-to", label: "Directions to here", icon: <ArrowRight size={15} />, onSelect: () => addStop(stopFromCoord(lng, lat), "end") });
        }
        if (opts.tools.geocode) {
          items.push({
            id: "whats-here",
            label: "What's here?",
            icon: <HelpCircle size={15} />,
            onSelect: () => {
              setWhatsHere({ label: "…", lng, lat });
              reverse(lng, lat).then((r) => setWhatsHere(r ?? { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lng, lat })).catch(() => setWhatsHere({ label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lng, lat }));
            },
          });
        }
        if (canAddPoint) items.push({ id: "add", label: "Add a point here", icon: <MapPinPlus size={15} />, onSelect: () => dropRecord(lng, lat) });
        items.push({ id: "zoom", label: "Zoom in here", icon: <ZoomIn size={15} />, onSelect: () => { const m = mapRef.current?.getMap(); if (m) zoomAroundPoint(m, [lng, lat], 1.6, reduceMotion); } });
      }
      if (items.length) setCtx({ x, y, items });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.tools.contextMenu, opts.tools.route, opts.tools.geocode, canAddPoint, reduceMotion, onOpen, reverse],
  );

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
      closeCtx();
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
        dropRecord(pt[0], pt[1]);
        return;
      }
      // feature click (cluster expand/spiderfy · point → popup or route stop)
      const feature = e.features?.[0];
      if (!feature) {
        if (pickingStop) {
          addStop(stopFromCoord(pt[0], pt[1]), "end");
          setWantStop(false);
          return;
        }
        setPopupId(null);
        return;
      }
      const props = feature.properties as Record<string, unknown>;
      if (props.cluster) {
        const src = mapRef.current?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
        const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
        const cid = Number(props.cluster_id);
        src?.getClusterExpansionZoom(cid).then((zoom) => {
          const map = mapRef.current;
          if (!map) return;
          // a cluster that won't separate further → spiderfy its leaves in place
          if (zoom > CLUSTER_MAX_ZOOM || zoom <= map.getZoom() + 0.4) {
            src?.getClusterLeaves(cid, 24, 0).then((leaves) => {
              const ids = (leaves as GeoJSON.Feature[]).map((f) => String((f.properties as { id?: unknown })?.id ?? "")).filter(Boolean);
              setClusterLeaves({ anchor: [lng, lat], ids });
            });
          } else {
            map.easeTo({ center: [lng, lat], zoom, duration: reduceMotion ? 0 : 500 });
          }
        });
        return;
      }
      if (props.id != null) {
        const rec = rowById(String(props.id));
        if (pickingStop && rec) { addStop(stopFromRecord(rec), "end"); setWantStop(false); }
        else setPopupId(String(props.id));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawMode, draft, addPointOn, onCreateDraft, pickingStop, reduceMotion, rowById, addStop],
  );

  const onMapDblClick = React.useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawMode === "line" || drawMode === "polygon") {
        e.preventDefault?.();
        commitDraw();
        return;
      }
      if (drawMode === "circle") return;
      const pt = ll(e);
      if (opts.camera.doubleClickAction === "addPoint" && canAddPoint) {
        dropRecord(pt[0], pt[1]);
        return;
      }
      const map = mapRef.current?.getMap();
      if (map) zoomAroundPoint(map, e.lngLat, 1.4, reduceMotion);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawMode, commitDraw, opts.camera.doubleClickAction, canAddPoint, reduceMotion],
  );

  const onMapContextMenu = React.useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawMode || addPointOn) return; // let those flows own the click
      e.preventDefault?.();
      const feature = e.features?.[0];
      const rec = feature && feature.properties && (feature.properties as { id?: unknown }).id != null ? rowById(String((feature.properties as { id?: unknown }).id)) : undefined;
      openContext(e.point.x, e.point.y, e.lngLat.lng, e.lngLat.lat, rec);
    },
    [drawMode, addPointOn, rowById, openContext],
  );

  const onMapMove = React.useCallback(
    (e: MapLayerMouseEvent) => {
      if (drawMode && (draft.length > 0 || drawMode !== "circle")) setHover(ll(e));
    },
    [drawMode, draft.length],
  );

  const [cursor, setCursor] = React.useState<string>();
  const drawing = drawMode !== null;
  const effectiveCursor = drawing || addPointOn || pickingStop ? "crosshair" : cursor;

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
  /* ── on-shape measurement label ──────────────────────────────────────────────
     The bottom chip is easy to miss, so the measurement also rides ON the shape
     at its centroid — area (auto-scaled) + perimeter + how many sites fall inside
     — and it updates LIVE while the polygon is being drawn or a vertex dragged,
     not only once the shape is closed. */
  const shapeLabel = React.useMemo(() => {
    // the live ring: a finished polygon, or the in-progress draft + the cursor
    const ring: LngLat[] =
      shape?.kind === "polygon"
        ? shape.points
        : drawMode === "polygon" && draft.length >= 2
          ? (hover ? [...draft, hover] : draft)
          : [];
    if (shape?.kind === "circle") {
      const a = Math.PI * shape.radiusM ** 2;
      return {
        at: shape.center,
        area: formatArea(a),
        // the raw m2 reading only informs at parcel scale; above 1 km2 it is noise
        raw: a < 1_000_000 ? formatAreaRaw(a) : null,
        perimeter: formatDistance(2 * Math.PI * shape.radiusM),
        perimeterLabel: "circumference",
      };
    }
    if (ring.length < 3) return null;
    const at = centroid(ring);
    const a = polygonArea(ring);
    return {
      at,
      area: formatArea(a),
      raw: a < 1_000_000 ? formatAreaRaw(a) : null,
      perimeter: formatDistance(ringPerimeter(ring)),
      perimeterLabel: "perimeter",
    };
  }, [shape, drawMode, draft, hover]);
  const drawHint = drawing
    ? drawMode === "circle"
      ? draft.length === 0
        ? "Click to set the centre"
        : "Click to set the radius"
      : "Click to add points · double-click to finish"
    : addPointOn
      ? "Click the map to place a new record"
      : undefined;

  const interactiveLayerIds = clusterRender ? ["map-clusters", "map-point"] : glPointRender ? ["map-point-plain"] : undefined;

  /* context-menu placement: flip toward the interior near an edge */
  const ctxStyle = React.useMemo<React.CSSProperties>(() => {
    if (!ctx) return {};
    const el = containerRef.current;
    const w = el?.clientWidth ?? 800;
    const h = el?.clientHeight ?? 600;
    const s: React.CSSProperties = {};
    if (ctx.x > w - 210) s.right = w - ctx.x;
    else s.left = ctx.x;
    if (ctx.y > h - 260) s.bottom = h - ctx.y;
    else s.top = ctx.y;
    return s;
  }, [ctx]);

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
      data-map-pitch={pitchAttr}
      data-map-bearing={bearingAttr}
      data-map-tiles={styleFailed ? "fallback" : "remote"}
      data-map-basemap={basemap}
      data-map-buildings={augments.buildings3d ? "1" : "0"}
      data-map-hillshade={augments.hillshade ? "1" : "0"}
      data-map-switching={switching ? "1" : "0"}
      data-map-projection={projection}
      data-map-points={mode.points ? "1" : "0"}
      data-map-heatmap={mode.heatmap ? "1" : "0"}
      data-map-clusterradius={clusRadius}
      data-map-drawmode={drawMode ?? ""}
      data-map-measure={measureText ?? ""}
      data-map-area={shape?.kind === "polygon" || shape?.kind === "circle" ? "1" : ""}
      data-map-inarea={inArea ? inArea.count : ""}
      data-map-route={activeRoute ? Math.round(activeRoute.distanceM) : ""}
      data-map-routealts={routeOptions.length}
      data-map-stops={stops.length}
      data-map-dark={darkBasemap ? "1" : "0"}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        if (ctx) {
          e.stopPropagation();
          closeCtx();
        } else if (drawing) {
          e.stopPropagation();
          setDraft([]);
          setHover(null);
          setDrawMode(null);
        } else if (addPointOn) {
          e.stopPropagation();
          setAddPointOn(false);
        } else if (itinOpen) {
          e.stopPropagation();
          closeItinerary();
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
        maxPitch={opts.camera.maxPitch}
        interactiveLayerIds={interactiveLayerIds}
        cursor={effectiveCursor}
        doubleClickZoom={false}
        /* fly-view gestures: ctrl/right-drag rotates + tilts (pitchWithRotate),
           two-finger touch tilts + rotates on mobile, keyboard arrows+shift steer.
           Trackpad tilt (⌥ + two-finger) is a custom wheel handler below. */
        dragRotate
        touchZoomRotate
        touchPitch
        keyboard
        onClick={onMapClick}
        onDblClick={onMapDblClick}
        onContextMenu={onMapContextMenu}
        onMouseMove={onMapMove}
        onMouseEnter={() => !drawing && setCursor("pointer")}
        onMouseLeave={() => setCursor(undefined)}
        onLoad={(e) => {
          setReady(true);
          succeed(e.target);
          syncGlState(e.target);
        }}
        onStyleData={(e) => {
          const map = e.target;
          // a REAL basemap style finished (maplibre fires `load` only once, so a
          // switch is confirmed here); the fallback style never counts as good.
          if (map.isStyleLoaded() && map.getStyle()?.name !== "offline-fallback") succeed(map);
        }}
        onError={(e) => {
          if (loadedRef.current) return;
          /* Only a genuine SOURCE/TILE failure may condemn a basemap. A missing
             glyph range or sprite is cosmetic — treating it as a style failure is
             what made a perfectly healthy basemap "unavailable" and bounced the
             user back to the last-good one. */
          const err = (e as { error?: Error & { url?: string } })?.error;
          const url = err?.url ?? "";
          const msg = err?.message ?? "";
          if (/\/fonts?\//i.test(url) || /sprite/i.test(url) || /glyph|sprite|font/i.test(msg)) return;
          scheduleFailure(); // retry-then-revert, never blank
        }}
        onIdle={(e) => {
          syncGlState(e.target);
          recomputeSpider();
          reassertProjection(); // restore globe + atmosphere after a style swap settles
          if (switching) setSwitching(false);
        }}
        onMove={(e) => {
          setPitchAttr(Math.round(e.target.getPitch()));
          setBearingAttr(Math.round(e.target.getBearing()));
        }}
        onZoomEnd={(e) => setZoomAttr(e.target.getZoom().toFixed(1))}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass showZoom visualizePitch />
        {opts.controls.fullscreen && !isMobile && <FullscreenControl position="top-right" />}
        {opts.controls.geolocate && <GeolocateControl position="top-right" positionOptions={{ enableHighAccuracy: true }} trackUserLocation />}
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
          <Source id={SOURCE_ID} type="geojson" data={featureCollection} cluster clusterMaxZoom={CLUSTER_MAX_ZOOM} clusterRadius={clusRadius}>
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
            {/* text-font is EXPLICIT: maplibre's default stack ("Open Sans Regular,
                Arial Unicode MS Regular") is not hosted by these styles' glyph
                servers and 404s — which used to condemn a healthy basemap. "Noto
                Sans Regular" is served by both OpenFreeMap and CARTO. */}
            {glyphs && (
              <Layer
                id="map-cluster-count"
                type="symbol"
                filter={["has", "point_count"]}
                layout={{ "text-field": "{point_count_abbreviated}", "text-size": 12, "text-font": ["Noto Sans Regular"] }}
                paint={{ "text-color": accentFg }}
              />
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
                        const rec = rowById(String(row.id));
                        if (pickingStop && rec) addStop(stopFromRecord(rec), "end");
                        else setPopupId(String(row.id));
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = containerRef.current?.getBoundingClientRect();
                        const rec = rowById(String(row.id));
                        if (rect) openContext(e.clientX - rect.left, e.clientY - rect.top, lng, lat, rec);
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

        {/* cluster spiderfy: temporary leaf pins fanned around the clicked cluster */}
        {clusterLeaves &&
          clusterLeaves.ids.map((id) => {
            const rec = rowById(id);
            if (!rec) return null;
            const off = clusterLeafOffsets.get(id);
            const dx = off?.dx ?? 0;
            const dy = off?.dy ?? 0;
            const tint = colorField ? optionMeta(colorField, rec.row[colorKey ?? ""]).color : undefined;
            return (
              <Marker key={`leaf-${id}`} longitude={clusterLeaves.anchor[0]} latitude={clusterLeaves.anchor[1]} anchor="bottom">
                <div className="nxMapPinCell">
                  <svg className="nxMapLeader" width="0" height="0" overflow="visible" aria-hidden="true">
                    <line x1="0" y1="0" x2={dx.toFixed(1)} y2={dy.toFixed(1)} />
                    <circle cx="0" cy="0" r="2.5" />
                  </svg>
                  <div className="nxMapPinOffset" style={{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }}>
                    <button
                      type="button"
                      className="nxMapPin"
                      data-testid={`map-leaf-${id}`}
                      aria-label={String(rec.row[titleField.key] ?? id)}
                      style={{ ...(tint ? { "--pin-color": `var(--nx-opt-${tint})` } : {}) } as React.CSSProperties}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopupId(id);
                        setClusterLeaves(null);
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

        {/* alternatives render UNDER the chosen route, dimmed — Google's look */}
        {routeOptions.length > 1 &&
          routeOptions.map((r, i) =>
            i === routeChoice ? null : (
              <Source key={`alt-${i}`} id={`map-route-alt-${i}`} type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.coordinates } }}>
                <Layer id={`map-route-alt-casing-${i}`} type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": surface, "line-width": 7, "line-opacity": 0.7 }} />
                <Layer id={`map-route-alt-line-${i}`} type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": colors["nx-fg-muted"] || "#8a8a8a", "line-width": 4, "line-opacity": 0.55 }} />
              </Source>
            ),
          )}

        {/* route line: a casing under a colored top line (Google-Maps look) */}
        {activeRoute && (
          <Source id="map-route" type="geojson" data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: activeRoute.coordinates } }}>
            <Layer id="map-route-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": surface, "line-width": 8, "line-opacity": 0.9 }} />
            <Layer id="map-route-line" type="line" layout={{ "line-cap": "round", "line-join": "round" }} paint={{ "line-color": accent, "line-width": 5, "line-opacity": activeRoute.approximate ? 0.7 : 0.95, ...(activeRoute.approximate ? { "line-dasharray": [1.4, 1] } : {}) }} />
          </Source>
        )}

        {/* draw + measure shapes (committed solid, draft dashed) */}
        {(shape || draft.length > 0) && (
          <Source id={DRAW_ID} type="geojson" data={drawFC}>
            <Layer id="map-draw-fill" type="fill" filter={["==", ["geometry-type"], "Polygon"]} paint={{ "fill-color": accent, "fill-opacity": 0.12 }} />
            <Layer id="map-draw-line" type="line" filter={["!", ["get", "draft"]]} paint={{ "line-color": accent, "line-width": 2.5 }} />
            <Layer id="map-draw-line-draft" type="line" filter={["get", "draft"]} paint={{ "line-color": accent, "line-width": 2, "line-dasharray": [2, 1.5] }} />
            <Layer id="map-draw-vertex" type="circle" filter={["==", ["geometry-type"], "Point"]} paint={{ "circle-radius": 4, "circle-color": surface, "circle-stroke-color": accent, "circle-stroke-width": 2 }} />
          </Source>
        )}

        {/* the measurement, ON the shape — live while drawing */}
        {shapeLabel && (
          <Marker longitude={shapeLabel.at[0]} latitude={shapeLabel.at[1]} anchor="center">
            <span className="nxMapAreaLabel" data-testid="map-area-label" role="status">
              <b className="nxMapAreaLabelMain">{shapeLabel.area}</b>
              {shapeLabel.raw && shapeLabel.raw !== shapeLabel.area && <span className="nxMapAreaLabelRaw">{shapeLabel.raw}</span>}
              <span className="nxMapAreaLabelRow">
                {shapeLabel.perimeterLabel} {shapeLabel.perimeter}
              </span>
              {inArea && (
                <span className="nxMapAreaLabelRow nxMapAreaLabelCount">
                  {inArea.count} of {inArea.total} sites inside
                </span>
              )}
            </span>
          </Marker>
        )}

        {searchMarker && (
          <Marker longitude={searchMarker.lng} latitude={searchMarker.lat} anchor="bottom">
            <span className="nxMapSearchPin" data-testid="map-search-pin" title={searchMarker.label} aria-label={searchMarker.label} />
          </Marker>
        )}

        {/* itinerary stop markers (A, B, C …) */}
        {stops.map((s, i) => (
          <Marker key={s.key} longitude={s.lng} latitude={s.lat} anchor="bottom">
            <span className="nxMapStopPin" data-testid={`map-stop-pin-${i}`} title={s.label} aria-label={`Stop ${stopLabel(i)}: ${s.label}`}>
              {stopLabel(i)}
            </span>
          </Marker>
        ))}

        {whatsHere && (
          <Popup longitude={whatsHere.lng} latitude={whatsHere.lat} anchor="bottom" offset={14} maxWidth="240px" className="nxMapPopup nxMapPopup--info" closeButton={false} onClose={() => setWhatsHere(null)}>
            <div data-testid="map-whatshere">
              <div className="nxMapWhatsHereLabel">{whatsHere.label}</div>
              <div className="nxMapWhatsHereCoord">{whatsHere.lat.toFixed(5)}, {whatsHere.lng.toFixed(5)}</div>
            </div>
          </Popup>
        )}

        {popupRow && (
          <Popup longitude={popupRow.lng} latitude={popupRow.lat} anchor="bottom" offset={clusterRender ? 12 : 30} maxWidth="280px" className="nxMapPopup" closeButton={false} onClose={() => setPopupId(null)}>
            <div data-testid="map-popup">
              <RecordCard object={object} row={popupRow.row} fields={popupFields} titleField={titleField.key} />
              <div className="nxMapPopupActions">
                <Button ref={popupOpenRef} size="sm" variant="primary" data-testid="map-popup-open" onClick={() => onOpen(String(popupRow.row.id))}>
                  Open
                </Button>
                {opts.tools.route && (
                  <>
                    <Button size="sm" variant="secondary" data-testid="map-popup-dir-from" onClick={() => openDirectionsFromRecord(popupRow, "start")}>
                      From here
                    </Button>
                    <Button size="sm" variant="secondary" data-testid="map-popup-dir-to" onClick={() => openDirectionsFromRecord(popupRow, "end")}>
                      To here
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Popup>
        )}
      </MapGL>

      {/* ── chrome overlays ── */}
      <div className="nxMapTopLeft">
        <MapSearch query={query} onQuery={setQuery} hits={searchHits} onPick={pickSearch} onClear={() => { setQuery(""); setGeoHits([]); setSearchMarker(null); }} geocodeEnabled={opts.tools.geocode} />
        <div className="nxMapControlsRow">
          <MapTypeMenu
            offered={opts.basemaps}
            active={basemap}
            onPick={pickBasemap}
            open={typeof viewState.mapTypeOpen === "boolean" ? viewState.mapTypeOpen : false}
            onOpenChange={(v) => onViewState({ mapTypeOpen: v })}
            buildings3d={buildings3d}
            hillshade={hillshade}
            vectorActive={vectorActive}
            projection={projection}
            onProjection={setProjection}
            earthActive={earthActive}
            onEarthPreset={applyEarthPreset}
            onToggleBuildings={(on) => { onViewState({ mapBuildings3d: on }); if (on) revealFor("buildings"); }}
            onToggleHillshade={(on) => { onViewState({ mapHillshade: on }); if (on) revealFor("hillshade"); }}
          />
          <Button
            size="sm"
            variant={flyActive ? "primary" : "secondary"}
            icon={<Box size={14} />}
            className="nxMapCtrlBtn"
            data-testid="map-fly-btn"
            aria-pressed={flyActive}
            title={
              flyActive
                ? "Level the view (top-down, north up) · ⌥ + scroll to tilt & rotate"
                : "3D fly view — tilt the camera · ⌥ + scroll to tilt & rotate, ⌥ + sideways to spin"
            }
            onClick={toggleFly}
          >
            {flyActive ? "2D" : "3D"}
          </Button>
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
            onDraw={(m) => { setDraft([]); setHover(null); setDrawMode(m); setItinOpen(false); }}
            hasShapes={hasDraw}
            onClear={clearDraw}
            drawEnabled={opts.tools.draw}
            addPointEnabled={canAddPoint}
            addPointOn={addPointOn}
            onAddPoint={(on) => { setAddPointOn(on); if (on) { setDrawMode(null); setItinOpen(false); } }}
            routeEnabled={opts.tools.route}
            routeOn={itinOpen}
            onRoute={(on) => { setItinOpen(on); if (on) { setDrawMode(null); setAddPointOn(false); } else clearItinerary(); }}
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

      {itinOpen && (
        <ItineraryPanel
          stops={stops}
          profile={profile}
          result={activeRoute}
          options={routeOptions}
          choice={routeChoice}
          onChoice={setRouteChoice}
          loading={routeLoading}
          addHint={pickingStop}
          onProfile={(p: Profile) => onViewState({ mapRouteProfile: p })}
          searchPlaces={searchPlaces}
          onPickStop={(i, hit) => setStopAt(i, hit.lng, hit.lat, hit.label)}
          onUseMyLocation={useMyLocation}
          onAddStop={() => setWantStop(true)}
          onStepClick={(at) => {
            const map = mapRef.current?.getMap();
            if (map) flyToPoint(map, at[0], at[1], Math.max(map.getZoom(), 16), reduceMotion);
          }}
          departAt={departAt}
          onDepartAt={setDepartAt}
          onRemoveStop={(i) => setStops((prev) => prev.filter((_, k) => k !== i))}
          onMoveStop={(from, to) => setStops((prev) => moveStop(prev, from, to))}
          onReverse={() => setStops((prev) => [...prev].reverse())}
          onClear={clearItinerary}
          onClose={closeItinerary}
        />
      )}

      {opts.legend && <Legend colorField={colorField} sizeFieldLabel={sizeField?.label} sizeExtent={ext} />}

      <ReadoutChips drawHint={drawHint} measure={measureText} area={areaText} inArea={inArea} onClearArea={clearDraw} />

      {opts.controls.minimap && overview && !isMobile && (
        <Minimap center={overview.center} zoom={overview.zoom} ring={overview.ring} accent={accent} onRecenter={(lng, lat) => flyTo(lng, lat, mapRef.current?.getZoom())} />
      )}

      {ctx && <MapContextMenu style={ctxStyle} items={ctx.items} onClose={closeCtx} />}

      {withoutLocation > 0 && (
        <span className="nxMapChip nxMapChip--without" role="status" data-testid="map-without-location">
          <Badge>{withoutLocation} without location</Badge>
        </span>
      )}
      {tileWarn && (
        <span className="nxMapChip nxMapChip--tiles nxMapTileChip" role="status" data-testid="map-tile-warn">
          {/* while background recovery runs the message is soft ("retrying"); it
              only hardens to "unavailable" once the attempts are exhausted */}
          <Badge tone="warn">
            {tileWarn.retrying
              ? `${BASEMAP_LABELS[tileWarn.failed]} is slow to load · showing ${BASEMAP_LABELS[tileWarn.kept]}, retrying…`
              : `${BASEMAP_LABELS[tileWarn.failed]} tiles unavailable · kept ${BASEMAP_LABELS[tileWarn.kept]}`}
          </Badge>
          {!tileWarn.retrying && (
            <button
              type="button"
              className="nxMapTileRetry"
              data-testid="map-tile-retry"
              onClick={() => {
                const failed = tileWarn.failed;
                setTileWarn(null);
                recoverRef.current = null;
                retryRef.current = 0;
                if (!reduceMotion) setSwitching(true);
                onViewState({ mapBasemap: failed });
              }}
            >
              Retry
            </button>
          )}
        </span>
      )}
      {styleFailed && (
        <span className="nxMapChip nxMapChip--tiles nxMapTileChip" role="status" data-testid="map-tiles-fallback">
          <Badge tone="warn">Map tiles unavailable</Badge>
          <button
            type="button"
            className="nxMapTileRetry"
            data-testid="map-tiles-retry"
            onClick={() => {
              setStyleFailed(false);
              retryRef.current = 0;
              setStyleNonce((n) => n + 1);
            }}
          >
            Retry
          </button>
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
