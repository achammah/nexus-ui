import * as React from "react";
import {
  Navigation,
  MapPin,
  CornerUpLeft,
  CornerUpRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowUp,
  RotateCw,
  RotateCcw,
  Split,
  Merge,
  ChevronUp,
  ChevronDown,
  X,
  Car,
  Footprints,
  Bike,
  GripVertical,
  Plus,
  LocateFixed,
  Clock,
  Search,
} from "lucide-react";
import { Button } from "../../../primitives/Button";
import { formatDistance, formatDuration, type LngLat } from "./geomath";
import { stopLabel, type Profile, type RouteResult, type RouteStep } from "./routing";

/* Directions / itinerary panel — the routing surface. Multi-stop (reorderable),
   a driving/walking/cycling profile switch, the total distance + ETA (labeled
   "est." when the result is a mock/derived), and the turn-by-turn steps with a
   maneuver icon each. MapView owns the stops + the route result; this renders it.
   Token-styled, light+dark; on mobile it docks as a bottom sheet (map.css). */

export interface Stop {
  key: string; // stable list key
  lng: number;
  lat: number;
  label: string;
  recordId?: string;
}

/* maneuver → icon (OSRM type + modifier) */
export function stepIcon(step: RouteStep): React.ReactNode {
  const size = 15;
  const m = step.modifier ?? "";
  switch (step.type) {
    case "depart":
      return <Navigation size={size} />;
    case "arrive":
      return <MapPin size={size} />;
    case "roundabout":
    case "rotary":
      return <RotateCw size={size} />;
    case "merge":
      return <Merge size={size} />;
    case "fork":
      return <Split size={size} />;
    default:
      if (m.includes("uturn")) return <RotateCcw size={size} />;
      if (m.includes("sharp left") || m.includes("slight left")) return <ArrowUpLeft size={size} />;
      if (m.includes("sharp right") || m.includes("slight right")) return <ArrowUpRight size={size} />;
      if (m.includes("left")) return <CornerUpLeft size={size} />;
      if (m.includes("right")) return <CornerUpRight size={size} />;
      return <ArrowUp size={size} />;
  }
}

const PROFILE_ICON: Record<Profile, React.ReactNode> = {
  driving: <Car size={15} />,
  walking: <Footprints size={15} />,
  cycling: <Bike size={15} />,
};
const PROFILE_LABEL: Record<Profile, string> = { driving: "Drive", walking: "Walk", cycling: "Cycle" };


/* a place suggestion for the from/to fields — a site record or a geocoded address */
export interface PlaceHit {
  kind: "record" | "address";
  id: string;
  label: string;
  sub?: string;
  lng: number;
  lat: number;
}

/* clock time for an ETA, in the viewer's locale ("14:32") */
function clockTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/* An editable A/B/C field: type to search records AND addresses, pick from the
   dropdown, drop in your current location, or leave it and click the map. This is
   what makes origin/destination freely settable rather than record-only. */
function StopField({
  index,
  stop,
  searchPlaces,
  onPick,
  onUseMyLocation,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  index: number;
  stop?: Stop;
  searchPlaces: (q: string) => Promise<PlaceHit[]>;
  onPick: (i: number, hit: PlaceHit) => void;
  onUseMyLocation: (i: number) => void;
  onRemove: (i: number) => void;
  onMove: (from: number, to: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<PlaceHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const boxRef = React.useRef<HTMLLIElement>(null);
  React.useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      searchPlaces(q).then((r) => live && setHits(r)).catch(() => live && setHits([]));
    }, 220);
    return () => { live = false; clearTimeout(t); };
  }, [q, searchPlaces]);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);
  const placeholder = index === 0 ? "Choose a starting point" : "Choose a destination";
  return (
    <li className="nxMapStop nxMapStop--field" data-testid={`map-stop-${index}`} ref={boxRef}>
      <span className="nxMapStopBadge" aria-hidden>
        <GripVertical size={12} className="nxMapStopGrip" />
        {stopLabel(index)}
      </span>
      <span className="nxMapStopInputWrap">
        <input
          className="nxMapStopInput"
          data-testid={`map-stop-input-${index}`}
          aria-label={`${stopLabel(index)} — ${placeholder}`}
          placeholder={placeholder}
          value={open || q ? q : (stop?.label ?? "")}
          onFocus={() => { setOpen(true); setQ(""); }}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setQ(""); }
            if (e.key === "Enter" && hits[0]) { onPick(index, hits[0]); setOpen(false); setQ(""); }
          }}
        />
        {open && (q.trim().length >= 2 || !stop) && (
          <div className="nxMapStopSuggest" data-testid={`map-stop-suggest-${index}`} role="listbox">
            <button type="button" className="nxMapStopSuggestRow nxMapStopSuggestRow--loc" data-testid={`map-stop-mylocation-${index}`} onClick={() => { onUseMyLocation(index); setOpen(false); setQ(""); }}>
              <LocateFixed size={13} /> Your location
            </button>
            {hits.map((h) => (
              <button key={h.id} type="button" role="option" className="nxMapStopSuggestRow" data-testid={`map-stop-hit-${index}-${h.id}`} onClick={() => { onPick(index, h); setOpen(false); setQ(""); }}>
                {h.kind === "record" ? <MapPin size={13} /> : <Search size={13} />}
                <span className="nxMapStopSuggestLabel">{h.label}</span>
                {h.sub && <span className="nxMapStopSuggestSub">{h.sub}</span>}
              </button>
            ))}
            {q.trim().length >= 2 && hits.length === 0 && <span className="nxMapStopSuggestEmpty">No match — or click the map</span>}
          </div>
        )}
      </span>
      <span className="nxMapStopControls">
        <button type="button" aria-label={`Move ${stopLabel(index)} up`} disabled={!canMoveUp} data-testid={`map-stop-up-${index}`} onClick={() => onMove(index, index - 1)}>
          <ChevronUp size={14} />
        </button>
        <button type="button" aria-label={`Move ${stopLabel(index)} down`} disabled={!canMoveDown} data-testid={`map-stop-down-${index}`} onClick={() => onMove(index, index + 1)}>
          <ChevronDown size={14} />
        </button>
        <button type="button" aria-label={`Remove ${stopLabel(index)}`} data-testid={`map-stop-remove-${index}`} onClick={() => onRemove(index)}>
          <X size={14} />
        </button>
      </span>
    </li>
  );
}

export function ItineraryPanel({
  stops,
  profile,
  result,
  loading,
  addHint,
  onProfile,
  onRemoveStop,
  onMoveStop,
  onReverse,
  onClear,
  onClose,
  searchPlaces,
  onPickStop,
  onUseMyLocation,
  onAddStop,
  onStepClick,
  departAt,
  onDepartAt,
}: {
  stops: Stop[];
  profile: Profile;
  result: RouteResult | null;
  loading: boolean;
  addHint: boolean;
  onProfile: (p: Profile) => void;
  onRemoveStop: (i: number) => void;
  onMoveStop: (from: number, to: number) => void;
  onReverse: () => void;
  onClear: () => void;
  onClose: () => void;
  searchPlaces: (q: string) => Promise<PlaceHit[]>;
  onPickStop: (i: number, hit: PlaceHit) => void;
  onUseMyLocation: (i: number) => void;
  onAddStop: () => void;
  onStepClick: (at: LngLat) => void;
  departAt: string; // "" = leave now, else "HH:MM"
  onDepartAt: (v: string) => void;
}) {
  /* Arrival = departure + duration. OSRM's demo profile is not traffic-aware, so
     this is an honest "no traffic" estimate, labelled as such — never a live ETA.
     Departure defaults to now; a depart-at time shifts it. */
  const depart = React.useMemo(() => {
    const d = new Date();
    if (/^\d{2}:\d{2}$/.test(departAt)) {
      const [h, m] = departAt.split(":").map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  }, [departAt]);
  const arrival = result ? new Date(depart.getTime() + result.durationS * 1000) : null;
  return (
    <div className="nxMapItinerary" role="region" aria-label="Directions" data-testid="map-itinerary">
      <div className="nxMapItinHeader">
        <span className="nxMapItinTitle">
          <Navigation size={15} /> Directions
        </span>
        <div className="nxMapProfileRow" role="tablist" aria-label="Travel mode">
          {(["driving", "walking", "cycling"] as Profile[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={profile === p}
              className="nxMapProfileBtn"
              data-active={profile === p || undefined}
              data-testid={`map-profile-${p}`}
              title={PROFILE_LABEL[p]}
              aria-label={PROFILE_LABEL[p]}
              onClick={() => onProfile(p)}
            >
              {PROFILE_ICON[p]}
            </button>
          ))}
        </div>
        <button type="button" className="nxMapItinClose" aria-label="Close directions" data-testid="map-itinerary-close" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      <ol className="nxMapStops" data-testid="map-stops">
        {stops.map((st, i) => (
          <StopField
            key={st.key}
            index={i}
            stop={st}
            searchPlaces={searchPlaces}
            onPick={onPickStop}
            onUseMyLocation={onUseMyLocation}
            onRemove={onRemoveStop}
            onMove={onMoveStop}
            canMoveUp={i > 0}
            canMoveDown={i < stops.length - 1}
          />
        ))}
        {/* always offer one empty field so from/to are directly typeable */}
        {stops.length < 2 && (
          <StopField
            key={`empty-${stops.length}`}
            index={stops.length}
            searchPlaces={searchPlaces}
            onPick={onPickStop}
            onUseMyLocation={onUseMyLocation}
            onRemove={onRemoveStop}
            onMove={onMoveStop}
            canMoveUp={false}
            canMoveDown={false}
          />
        )}
      </ol>

      <button type="button" className="nxMapAddStop" data-testid="map-add-stop" onClick={onAddStop}>
        <Plus size={14} /> Add stop
      </button>

      {addHint && (
        <div className="nxMapItinHint" data-testid="map-itinerary-hint">
          Click a record or the map to add a stop
        </div>
      )}

      {stops.length >= 2 && (
        <div className="nxMapItinActions">
          <Button size="sm" variant="secondary" data-testid="map-itinerary-reverse" onClick={onReverse}>
            Reverse
          </Button>
          <Button size="sm" variant="secondary" data-testid="map-itinerary-clear" onClick={onClear}>
            Clear
          </Button>
        </div>
      )}

      {result && (
        <div className="nxMapItinSummary" data-testid="map-itinerary-summary">
          <span className="nxMapItinHeadline">
            <strong className="nxMapItinDur">{formatDuration(result.durationS)}</strong>
            <span className="nxMapItinDist">{formatDistance(result.distanceM)}</span>
          </span>
          {arrival && (
            <span className="nxMapItinArrive" data-testid="map-itinerary-arrival">
              <Clock size={13} /> arrive {clockTime(arrival)}
            </span>
          )}
          <span className="nxMapItinProvider">
            {result.provider === "osrm" ? "via OSRM" : result.provider === "custom" ? "via provider" : "estimate"}
            {result.approximate ? " · est." : ""} · no traffic
          </span>
        </div>
      )}

      <label className="nxMapDepartRow">
        <Clock size={13} />
        <span>Depart</span>
        <input
          type="time"
          className="nxMapDepartInput"
          data-testid="map-depart-at"
          aria-label="Departure time"
          value={departAt}
          onChange={(e) => onDepartAt(e.target.value)}
        />
        {departAt && (
          <button type="button" className="nxMapDepartNow" data-testid="map-depart-now" onClick={() => onDepartAt("")}>
            now
          </button>
        )}
      </label>

      {loading && <div className="nxMapItinLoading" data-testid="map-itinerary-loading">Finding the best route…</div>}

      {result && result.steps.length > 0 && (
        <ol className="nxMapSteps" data-testid="map-steps">
          {result.steps.map((step, i) => (
            <li key={i}>
              {/* clicking a manoeuvre flies the map to it — the list is a control,
                  not a static readout */}
              <button
                type="button"
                className="nxMapStepRow"
                data-testid={`map-step-${i}`}
                disabled={!step.at}
                onClick={() => step.at && onStepClick(step.at)}
              >
                <span className="nxMapStepIcon" aria-hidden>
                  {stepIcon(step)}
                </span>
                <span className="nxMapStepText">{step.instruction}</span>
                {step.distanceM > 0 && <span className="nxMapStepDist">{formatDistance(step.distanceM)}</span>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
