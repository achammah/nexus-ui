import * as React from "react";
import {
  Layers,
  Map as MapIcon,
  Pentagon,
  Circle as CircleIcon,
  MapPinPlus,
  Route as RouteIcon,
  Search,
  X,
  Ruler,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import { Badge, Checkbox, Input } from "../../../primitives/fields";
import { BASEMAP_LABELS, type BasemapId } from "./basemaps";
import type { FieldDef } from "../../types";
import { normalizeOption } from "../../types";
import { MARKER_MAX_R, MARKER_MIN_R } from "./geo";

/* Presentational map chrome — all token-styled (map.css), light+dark, mobile.
   These are dumb components: MapView owns the map, the state and every handler.
   Kept here so MapView reads as the map/layers/draw logic, not the toolbar JSX. */

/* ── basemap switcher (streets/light/dark/satellite/terrain) ─────────────── */
export function BasemapSwitcher({
  offered,
  active,
  onPick,
}: {
  offered: BasemapId[];
  active: BasemapId;
  onPick: (id: BasemapId) => void;
}) {
  if (offered.length <= 1) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" icon={<MapIcon size={14} />} data-testid="map-basemap-btn" className="nxMapCtrlBtn">
          {BASEMAP_LABELS[active]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="nxMapMenu">
        <DropdownMenuLabel>Basemap</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={active} onValueChange={(v) => onPick(v as BasemapId)}>
          {offered.map((id) => (
            <DropdownMenuRadioItem key={id} value={id} data-testid={`map-basemap-${id}`}>
              {BASEMAP_LABELS[id]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── layers panel: points / clusters / heatmap toggles + cluster radius ───── */
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
  const tool = (
    id: string,
    label: string,
    icon: React.ReactNode,
    on: boolean,
    onClick: () => void,
    testid: string,
  ) => (
    <button
      key={id}
      type="button"
      className="nxMapTool"
      data-active={on || undefined}
      data-testid={testid}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
  return (
    <div className="nxMapToolRail" role="toolbar" aria-label="Map tools" data-testid="map-tool-rail">
      {drawEnabled && (
        <>
          {tool("line", "Measure distance", <Ruler size={16} />, drawMode === "line", () => onDraw(drawMode === "line" ? null : "line"), "map-draw-line")}
          {tool("polygon", "Draw area", <Pentagon size={16} />, drawMode === "polygon", () => onDraw(drawMode === "polygon" ? null : "polygon"), "map-draw-polygon")}
          {tool("circle", "Draw radius", <CircleIcon size={16} />, drawMode === "circle", () => onDraw(drawMode === "circle" ? null : "circle"), "map-draw-circle")}
        </>
      )}
      {addPointEnabled &&
        tool("addpoint", "Add a point", <MapPinPlus size={16} />, addPointOn, () => onAddPoint(!addPointOn), "map-addpoint-btn")}
      {routeEnabled &&
        tool("route", "Route between records", <RouteIcon size={16} />, routeOn, () => onRoute(!routeOn), "map-route-btn")}
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

/* ── readout chips (measure / area / in-area / route / draw hint) ─────────── */
export function ReadoutChips({
  drawHint,
  measure,
  area,
  inArea,
  onClearArea,
  route,
  onClearRoute,
}: {
  drawHint?: string;
  measure?: string;
  area?: string;
  inArea?: { count: number; total: number } | null;
  onClearArea: () => void;
  route?: string;
  onClearRoute: () => void;
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
      {route && (
        <span className="nxMapReadout nxMapReadout--route" role="status" data-testid="map-route-readout">
          <RouteIcon size={13} /> {route}
          <button type="button" onClick={onClearRoute} aria-label="Clear route" data-testid="map-route-clear">
            <X size={12} />
          </button>
        </span>
      )}
    </div>
  );
}
