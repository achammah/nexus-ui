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
} from "lucide-react";
import { Button } from "../../../primitives/Button";
import { formatDistance, formatDuration } from "./geomath";
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
}) {
  const summary =
    result && `${formatDistance(result.distanceM)} · ${formatDuration(result.durationS)}${result.approximate ? " · est." : ""}`;
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
        {stops.map((s, i) => (
          <li key={s.key} className="nxMapStop" data-testid={`map-stop-${i}`}>
            <span className="nxMapStopBadge" aria-hidden>
              <GripVertical size={12} className="nxMapStopGrip" />
              {stopLabel(i)}
            </span>
            <span className="nxMapStopLabel">{s.label}</span>
            <span className="nxMapStopControls">
              <button type="button" aria-label={`Move ${stopLabel(i)} up`} disabled={i === 0} data-testid={`map-stop-up-${i}`} onClick={() => onMoveStop(i, i - 1)}>
                <ChevronUp size={14} />
              </button>
              <button type="button" aria-label={`Move ${stopLabel(i)} down`} disabled={i === stops.length - 1} data-testid={`map-stop-down-${i}`} onClick={() => onMoveStop(i, i + 1)}>
                <ChevronDown size={14} />
              </button>
              <button type="button" aria-label={`Remove ${stopLabel(i)}`} data-testid={`map-stop-remove-${i}`} onClick={() => onRemoveStop(i)}>
                <X size={14} />
              </button>
            </span>
          </li>
        ))}
      </ol>

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

      {summary && (
        <div className="nxMapItinSummary" data-testid="map-itinerary-summary">
          <strong>{summary}</strong>
          <span className="nxMapItinProvider">
            {result?.provider === "osrm" ? "via OSRM" : result?.provider === "custom" ? "via provider" : "estimate"}
          </span>
        </div>
      )}

      {loading && <div className="nxMapItinLoading" data-testid="map-itinerary-loading">Finding the best route…</div>}

      {result && result.steps.length > 0 && (
        <ol className="nxMapSteps" data-testid="map-steps">
          {result.steps.map((step, i) => (
            <li key={i} className="nxMapStepRow" data-testid={`map-step-${i}`}>
              <span className="nxMapStepIcon" aria-hidden>
                {stepIcon(step)}
              </span>
              <span className="nxMapStepText">{step.instruction}</span>
              {step.distanceM > 0 && <span className="nxMapStepDist">{formatDistance(step.distanceM)}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
