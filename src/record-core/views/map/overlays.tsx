import * as React from "react";
import {
  Layers,
  Pentagon,
  Circle as CircleIcon,
  MapPinPlus,
  Route as RouteIcon,
  Search,
  X,
  Ruler,
  Map as MapIcon,
  Boxes,
  Mountain,
  Globe,
  Globe2,
} from "lucide-react";
import { Button } from "../../../primitives/Button";
import { Checkbox, Input } from "../../../primitives/fields";
import { BASEMAP_LABELS, type BasemapId } from "./basemaps";
import type { FieldDef } from "../../types";
import { normalizeOption } from "../../types";
import { MARKER_MAX_R, MARKER_MIN_R } from "./geo";

/* Presentational map chrome — all token-styled (map.css), light+dark, mobile.
   These are dumb components: MapView owns the map, the state and every handler.
   Kept here so MapView reads as the map/layers/draw logic, not the toolbar JSX.
   (Bigger surfaces — the right-click ContextMenu, the ItineraryPanel, the Minimap
   inset — live in their own files.) */

/* ── map-type menu: base appearance (streets/light/dark/satellite/hybrid/terrain)
      as labeled swatches, Google-Maps style, + the 3D-buildings and terrain-shading
      overlays. Base APPEARANCE lives here; DATA layers live in LayersPanel. ────── */
export function MapTypeMenu({
  offered,
  active,
  onPick,
  open,
  onOpenChange,
  buildings3d,
  hillshade,
  vectorActive,
  projection,
  onProjection,
  earthActive,
  onEarthPreset,
  onToggleBuildings,
  onToggleHillshade,
}: {
  offered: BasemapId[];
  active: BasemapId;
  onPick: (id: BasemapId) => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  buildings3d: boolean;
  hillshade: boolean;
  vectorActive: boolean;
  projection: "flat" | "globe";
  onProjection: (mode: "flat" | "globe") => void;
  earthActive: boolean;
  onEarthPreset: () => void;
  onToggleBuildings: (on: boolean) => void;
  onToggleHillshade: (on: boolean) => void;
}) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onOpenChange]);
  return (
    <div className="nxMapTypes" ref={rootRef}>
      <Button
        size="sm"
        variant={open ? "primary" : "secondary"}
        icon={<MapIcon size={14} />}
        data-testid="map-basemap-btn"
        aria-expanded={open}
        aria-controls="nxMapTypePanel"
        className="nxMapCtrlBtn"
        onClick={() => onOpenChange(!open)}
      >
        {BASEMAP_LABELS[active]}
      </Button>
      {open && (
        <div
          className="nxMapTypePanel"
          id="nxMapTypePanel"
          role="group"
          aria-label="Map type"
          data-testid="map-type-panel"
          onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}
        >
          {/* Projection (flat|globe) and basemap STYLE are orthogonal axes: any
             style renders under either projection. "Earth" is a named PRESET over
             those axes (globe + satellite + tilt), offered as a one-tap chip — not
             a third exclusive projection. */}
          <div className="nxMapProjRow">
            <div className="nxMapProjTabs" role="tablist" aria-label="Projection">
              {([
                ["flat", "Flat", <MapIcon key="f" size={13} />],
                ["globe", "Globe", <Globe key="g" size={13} />],
              ] as const).map(([m, label, icon]) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={projection === m}
                  className="nxMapProjBtn"
                  data-active={projection === m || undefined}
                  data-testid={`map-proj-${m}`}
                  onClick={() => onProjection(m)}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="nxMapProjBtn nxMapProjPreset"
              aria-pressed={earthActive}
              data-active={earthActive || undefined}
              data-testid="map-proj-earth"
              onClick={onEarthPreset}
              title="Earth preset — globe view with satellite imagery and tilt"
            >
              <Globe2 size={13} />
              <span>Earth</span>
            </button>
          </div>
          <div className="nxMapTypeGrid">
            {offered.map((id) => (
              <button
                key={id}
                type="button"
                className="nxMapTypeTile"
                data-active={id === active || undefined}
                aria-pressed={id === active}
                data-testid={`map-basemap-${id}`}
                onClick={() => onPick(id)}
              >
                <span className={`nxMapTypeSwatch nxMapTypeSwatch--${id}`} aria-hidden />
                <span className="nxMapTypeLabel">{BASEMAP_LABELS[id]}</span>
              </button>
            ))}
          </div>
          <div className="nxMapTypeToggles">
            <label className="nxMapLayerRow" data-disabled={!vectorActive || undefined} title={vectorActive ? undefined : "Available on vector basemaps (streets/light/dark)"}>
              <Checkbox checked={buildings3d && vectorActive} disabled={!vectorActive} onCheckedChange={(v) => onToggleBuildings(!!v)} data-testid="map-toggle-buildings" />
              <Boxes size={14} />
              <span>3D buildings</span>
            </label>
            <label className="nxMapLayerRow">
              <Checkbox checked={hillshade} onCheckedChange={(v) => onToggleHillshade(!!v)} data-testid="map-toggle-hillshade" />
              <Mountain size={14} />
              <span>Terrain shading</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── layers panel: points / clusters / heatmap toggles + cluster radius (DATA) ── */
export function LayersPanel({
  open,
  onOpenChange,
  points,
  clusters,
  heatmap,
  heatmapOffered,
  clusterRadius,
  colorFieldLabel,
  sizeFieldLabel,
  onToggle,
  onRadius,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  points: boolean;
  clusters: boolean;
  heatmap: boolean;
  heatmapOffered: boolean;
  clusterRadius: number;
  colorFieldLabel?: string;
  sizeFieldLabel?: string;
  onToggle: (layer: "points" | "clusters" | "heatmap", on: boolean) => void;
  onRadius: (r: number) => void;
}) {
  return (
    <div className="nxMapLayers">
      <Button
        size="sm"
        variant={open ? "primary" : "secondary"}
        icon={<Layers size={14} />}
        data-testid="map-layers-btn"
        aria-expanded={open}
        aria-controls="nxMapLayersPanel"
        className="nxMapCtrlBtn"
        onClick={() => onOpenChange(!open)}
      >
        Layers
      </Button>
      {open && (
        <div className="nxMapLayersPanel" id="nxMapLayersPanel" role="group" aria-label="Map layers" data-testid="map-layers-panel">
          <label className="nxMapLayerRow">
            <Checkbox checked={points} onCheckedChange={(v) => onToggle("points", !!v)} data-testid="map-layer-points" />
            <span>Points</span>
          </label>
          <label className="nxMapLayerRow" data-disabled={!points || undefined}>
            <Checkbox checked={clusters} disabled={!points} onCheckedChange={(v) => onToggle("clusters", !!v)} data-testid="map-layer-clusters" />
            <span>Cluster nearby</span>
          </label>
          {clusters && points && (
            <div className="nxMapSlider">
              <span className="nxMapSliderLabel">Cluster radius</span>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={clusterRadius}
                data-testid="map-cluster-radius"
                aria-label="Cluster radius"
                onChange={(e) => onRadius(Number(e.target.value))}
              />
              <span className="nxMapSliderValue">{clusterRadius}px</span>
            </div>
          )}
          {heatmapOffered && (
            <label className="nxMapLayerRow">
              <Checkbox checked={heatmap} onCheckedChange={(v) => onToggle("heatmap", !!v)} data-testid="map-layer-heatmap" />
              <span>Heatmap</span>
            </label>
          )}
          {(colorFieldLabel || sizeFieldLabel) && (
            <div className="nxMapLayersMeta">
              {colorFieldLabel && <span>Colored by {colorFieldLabel}</span>}
              {sizeFieldLabel && <span>Sized by {sizeFieldLabel}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── draw / measure / add-point / route tool rail ────────────────────────── */
export function DrawTools({
  drawMode,
  onDraw,
  hasShapes,
  onClear,
  drawEnabled,
  addPointEnabled,
  addPointOn,
  onAddPoint,
  routeEnabled,
  routeOn,
  onRoute,
}: {
  drawMode: string | null;
  onDraw: (m: "line" | "polygon" | "circle" | null) => void;
  hasShapes: boolean;
  onClear: () => void;
  drawEnabled: boolean;
  addPointEnabled: boolean;
  addPointOn: boolean;
  onAddPoint: (on: boolean) => void;
  routeEnabled: boolean;
  routeOn: boolean;
  onRoute: (on: boolean) => void;
}) {
  const tool = (id: string, label: string, icon: React.ReactNode, on: boolean, onClick: () => void, testid: string) => (
    <button key={id} type="button" className="nxMapTool" data-active={on || undefined} data-testid={testid} aria-pressed={on} aria-label={label} title={label} onClick={onClick}>
      {icon}
    </button>
  );
  return (
    <div className="nxMapToolRail" role="toolbar" aria-label="Map tools" data-testid="map-tool-rail">
      {/* Directions is the rail's headline action, so it carries a visible LABEL
          rather than being one more anonymous icon — users were not finding the
          itinerary at all. The remaining tools stay icon-only. */}
      {routeEnabled && (
        <button
          type="button"
          className="nxMapTool nxMapTool--labelled"
          data-active={routeOn || undefined}
          data-testid="map-route-btn"
          aria-pressed={routeOn}
          aria-label="Directions"
          title="Directions — build a multi-stop itinerary"
          onClick={() => onRoute(!routeOn)}
        >
          <RouteIcon size={16} />
          <span className="nxMapToolLabel">Directions</span>
        </button>
      )}
      {drawEnabled && (
        <>
          {tool("line", "Measure distance", <Ruler size={16} />, drawMode === "line", () => onDraw(drawMode === "line" ? null : "line"), "map-draw-line")}
          {tool("polygon", "Draw area", <Pentagon size={16} />, drawMode === "polygon", () => onDraw(drawMode === "polygon" ? null : "polygon"), "map-draw-polygon")}
          {tool("circle", "Draw radius", <CircleIcon size={16} />, drawMode === "circle", () => onDraw(drawMode === "circle" ? null : "circle"), "map-draw-circle")}
        </>
      )}
      {addPointEnabled && tool("addpoint", "Add a point", <MapPinPlus size={16} />, addPointOn, () => onAddPoint(!addPointOn), "map-addpoint-btn")}
      {hasShapes && (
        <button type="button" className="nxMapTool nxMapTool--clear" data-testid="map-draw-clear" aria-label="Clear drawing" title="Clear drawing" onClick={onClear}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* ── search + geocode box ────────────────────────────────────────────────── */
export interface SearchHit {
  kind: "record" | "address";
  id: string;
  label: string;
  sub?: string;
  lng: number;
  lat: number;
  approximate?: boolean;
}

export function MapSearch({
  query,
  onQuery,
  hits,
  onPick,
  onClear,
  geocodeEnabled,
}: {
  query: string;
  onQuery: (q: string) => void;
  hits: SearchHit[];
  onPick: (h: SearchHit) => void;
  onClear: () => void;
  geocodeEnabled: boolean;
}) {
  const [focused, setFocused] = React.useState(false);
  const open = focused && query.trim().length > 0;
  return (
    <div className="nxMapSearch" data-testid="map-search-box">
      <span className="nxMapSearchIcon" aria-hidden>
        <Search size={15} />
      </span>
      <Input
        value={query}
        data-testid="map-search"
        aria-label={geocodeEnabled ? "Search records or an address" : "Search records"}
        placeholder={geocodeEnabled ? "Search records or an address" : "Search records"}
        onChange={(e) => onQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {query && (
        <button type="button" className="nxMapSearchClear" data-testid="map-search-clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={onClear}>
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="nxMapSearchResults" role="listbox" data-testid="map-search-results">
          {hits.length === 0 ? (
            <div className="nxMapSearchEmpty">No matches</div>
          ) : (
            hits.map((h) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                role="option"
                aria-selected={false}
                className="nxMapSearchRow"
                data-testid={`map-${h.kind === "record" ? "search-result" : "geocode-result"}-${h.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(h)}
              >
                <span className={`nxMapSearchKind nxMapSearchKind--${h.kind}`}>{h.kind === "record" ? "Record" : "Place"}</span>
                <span className="nxMapSearchLabel">
                  {h.label}
                  {h.approximate && <em> · approx.</em>}
                </span>
                {h.sub && <span className="nxMapSearchSub">{h.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ── legend: color-field swatches + size ramp ────────────────────────────── */
export function Legend({
  colorField,
  sizeFieldLabel,
  sizeExtent,
}: {
  colorField?: FieldDef;
  sizeFieldLabel?: string;
  sizeExtent?: { min: number; max: number } | null;
}) {
  const opts = colorField?.options ?? [];
  if (opts.length === 0 && !sizeFieldLabel) return null;
  return (
    <div className="nxMapLegend" data-testid="map-legend">
      {opts.length > 0 && (
        <div className="nxMapLegendBlock">
          <div className="nxMapLegendTitle">{colorField?.label}</div>
          {opts.map((o) => {
            const m = normalizeOption(o);
            return (
              <div key={m.value} className="nxMapLegendRow">
                <span className="nxMapLegendSwatch" style={{ background: m.color ? `var(--nx-opt-${m.color})` : "var(--nx-accent)" }} aria-hidden />
                <span>{m.label}</span>
              </div>
            );
          })}
        </div>
      )}
      {sizeFieldLabel && (
        <div className="nxMapLegendBlock">
          <div className="nxMapLegendTitle">{sizeFieldLabel}</div>
          <div className="nxMapLegendRow nxMapLegendSize">
            <span className="nxMapLegendDot" style={{ width: MARKER_MIN_R * 2, height: MARKER_MIN_R * 2 }} aria-hidden />
            <span className="nxMapLegendDot" style={{ width: MARKER_MAX_R * 2, height: MARKER_MAX_R * 2 }} aria-hidden />
            {sizeExtent && (
              <span className="nxMapLegendScale">
                {Math.round(sizeExtent.min).toLocaleString("en-US")}–{Math.round(sizeExtent.max).toLocaleString("en-US")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── readout chips (measure / area / in-area / draw hint) ─────────────────── */
export function ReadoutChips({
  drawHint,
  measure,
  area,
  inArea,
  onClearArea,
}: {
  drawHint?: string;
  measure?: string;
  area?: string;
  inArea?: { count: number; total: number } | null;
  onClearArea: () => void;
}) {
  return (
    <div className="nxMapReadouts">
      {drawHint && (
        <span className="nxMapReadout nxMapReadout--hint" role="status" data-testid="map-draw-hint">
          {drawHint}
        </span>
      )}
      {measure && (
        <span className="nxMapReadout" role="status" data-testid="map-measure-readout">
          <Ruler size={13} /> {measure}
        </span>
      )}
      {area && (
        <span className="nxMapReadout" role="status" data-testid="map-area-readout">
          <Pentagon size={13} /> {area}
        </span>
      )}
      {inArea && (
        <span className="nxMapReadout nxMapReadout--area" role="status" data-testid="map-inarea-chip">
          {inArea.count} of {inArea.total} in area
          <button type="button" onClick={onClearArea} aria-label="Clear area filter" data-testid="map-inarea-clear">
            <X size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
