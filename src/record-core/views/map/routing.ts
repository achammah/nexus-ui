import type { LngLat } from "./geomath";
import { haversine, pathLength } from "./geomath";

/* Routing + itinerary SEAM for the map view.
   ─────────────────────────────────────────────────────────────────────────────
   ⚑ FLAGGED SEAM. Turn-by-turn directions need a routing service. This module
   ships THREE providers behind one contract, resolved in order:

     1. a CUSTOM endpoint (`routeEndpoint`) — an app route that proxies any vendor
        SERVER-SIDE (the key never reaches the browser). Returns the shape below.
     2. the PUBLIC OSRM demo (`osrmBaseUrl`, default https://router.project-osrm.org)
        — real road geometry + real turn-by-turn, keyless. If its host is outside the
        app CSP allow-list the fetch fails and we FALL BACK to (3), labeled honestly.
     3. a deterministic LOCAL MOCK — a densified great-circle path with synthesized
        steps, marked `approximate`, so the itinerary UI is never empty offline / in CI.

   No key is hardcoded and no vendor host is assumed reachable: whatever the host's
   CSP allows, the flow stays wired end-to-end. See docs/RECIPES.md "Give an object a
   map view" › routing seam. */

export type Profile = "driving" | "walking" | "cycling";

export interface RouteStep {
  instruction: string; // composed human text ("Turn left onto Rue de la Loi")
  distanceM: number;
  durationS: number;
  type: string; // OSRM maneuver type (depart/turn/roundabout/arrive/…) — drives the icon
  modifier?: string; // left/right/straight/slight left/…
  name?: string; // road name
}

export interface RouteLeg {
  distanceM: number;
  durationS: number;
  steps: RouteStep[];
}

export interface RouteResult {
  coordinates: LngLat[]; // full path geometry, GeoJSON [lng,lat] order
  distanceM: number;
  durationS: number;
  legs: RouteLeg[];
  steps: RouteStep[]; // flattened across legs — what the directions panel lists
  approximate?: boolean; // true = mock/derived (no road snapping or real ETA)
  provider: "custom" | "osrm" | "mock";
}

export type RouteProvider = (waypoints: LngLat[], profile: Profile) => Promise<RouteResult>;

/* mock/derived travel speeds (m/s) per profile — a stand-in ETA when a real
   duration isn't available (mock, or a non-driving profile on the driving-only demo) */
const SPEED: Record<Profile, number> = { driving: 13.3, walking: 1.4, cycling: 4.5 };

/* ── instruction composition ─────────────────────────────────────────────── */

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
const bearingLabel = (deg?: number): string =>
  typeof deg === "number" ? COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8] : "on your way";

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* readable instruction from an OSRM-shaped maneuver (OSRM returns the maneuver,
   not a sentence — the sentence is composed client-side) */
function composeInstruction(type: string, modifier: string | undefined, name: string | undefined, bearing?: number): string {
  const onto = name ? ` onto ${name}` : "";
  const on = name ? ` on ${name}` : "";
  switch (type) {
    case "depart": return `Head ${bearingLabel(bearing)}${on}`;
    case "turn": return `Turn ${modifier ?? "ahead"}${onto}`;
    case "new name": return `Continue${on}`;
    case "continue": return `Continue ${modifier ?? "straight"}${onto}`;
    case "merge": return `Merge${onto}`;
    case "on ramp": return `Take the ramp${onto}`;
    case "off ramp": return `Take the exit${onto}`;
    case "fork": return `Keep ${modifier ?? "straight"}${onto}`;
    case "end of road": return `Turn ${modifier ?? "ahead"}${onto}`;
    case "roundabout":
    case "rotary": return `At the roundabout, continue${onto}`;
    case "arrive": return "Arrive at your destination";
    default: return `${cap(type)}${modifier ? ` ${modifier}` : ""}${onto}`;
  }
}

/* ── OSRM provider ───────────────────────────────────────────────────────── */

interface OsrmManeuver { type?: string; modifier?: string; bearing_after?: number }
interface OsrmStep { distance?: number; duration?: number; name?: string; maneuver?: OsrmManeuver }
interface OsrmLeg { distance?: number; duration?: number; steps?: OsrmStep[] }
interface OsrmRoute { distance?: number; duration?: number; geometry?: { coordinates?: LngLat[] }; legs?: OsrmLeg[] }

function parseOsrm(route: OsrmRoute, profile: Profile): RouteResult {
  const coordinates = (route.geometry?.coordinates ?? []) as LngLat[];
  const legs: RouteLeg[] = (route.legs ?? []).map((leg) => ({
    distanceM: leg.distance ?? 0,
    durationS: leg.duration ?? 0,
    steps: (leg.steps ?? []).map((s) => ({
      instruction: composeInstruction(s.maneuver?.type ?? "continue", s.maneuver?.modifier, s.name, s.maneuver?.bearing_after),
      distanceM: s.distance ?? 0,
      durationS: s.duration ?? 0,
      type: s.maneuver?.type ?? "continue",
      modifier: s.maneuver?.modifier,
      name: s.name || undefined,
    })),
  }));
  const distanceM = route.distance ?? legs.reduce((n, l) => n + l.distanceM, 0);
  // the public demo is driving-only; for walking/cycling derive the ETA from distance
  const durationS = profile === "driving" ? (route.duration ?? distanceM / SPEED.driving) : distanceM / SPEED[profile];
  return { coordinates, distanceM, durationS, legs, steps: legs.flatMap((l) => l.steps), approximate: profile !== "driving", provider: "osrm" };
}

async function osrmRoute(base: string, waypoints: LngLat[], profile: Profile): Promise<RouteResult> {
  const coords = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(";");
  // the public demo serves the driving profile; a self-hosted OSRM can serve others
  const p = base.includes("project-osrm.org") ? "driving" : profile;
  const url = `${base.replace(/\/$/, "")}/route/v1/${p}/${coords}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  const data = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
  if (data.code !== "Ok" || !data.routes?.length) throw new Error(`osrm ${data.code ?? "no-route"}`);
  return parseOsrm(data.routes[0], profile);
}

/* ── mock provider (offline / CI / CSP-blocked fallback) ─────────────────── */

export const mockRoute: RouteProvider = async (waypoints, profile) => {
  const coordinates: LngLat[] = [];
  const STEPS = 24;
  const legs: RouteLeg[] = [];
  for (let leg = 0; leg < waypoints.length - 1; leg++) {
    const a = waypoints[leg];
    const b = waypoints[leg + 1];
    for (let s = 0; s <= STEPS; s++) {
      if (leg > 0 && s === 0) continue; // don't duplicate the shared vertex
      const t = s / STEPS;
      coordinates.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    const legDist = haversine(a, b);
    const legDur = legDist / SPEED[profile];
    const bearing = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const legSteps: RouteStep[] =
      leg === 0
        ? [
            { instruction: composeInstruction("depart", undefined, undefined, bearing), distanceM: legDist, durationS: legDur, type: "depart" },
            { instruction: composeInstruction("arrive", undefined, undefined), distanceM: 0, durationS: 0, type: "arrive" },
          ]
        : [
            { instruction: `Continue to stop ${leg + 1}`, distanceM: legDist, durationS: legDur, type: "continue", modifier: "straight" },
            { instruction: composeInstruction("arrive", undefined, undefined), distanceM: 0, durationS: 0, type: "arrive" },
          ];
    legs.push({ distanceM: legDist, durationS: legDur, steps: legSteps });
  }
  const distanceM = pathLength(waypoints);
  return {
    coordinates,
    distanceM,
    durationS: distanceM / SPEED[profile],
    legs,
    steps: legs.flatMap((l) => l.steps),
    approximate: true,
    provider: "mock",
  };
};

/* ── the resolved provider ───────────────────────────────────────────────── */

export interface RouterConfig {
  endpoint?: string; // custom app proxy (POST {waypoints, profile})
  osrmBaseUrl?: string; // public/self-hosted OSRM ("" disables → straight to mock)
}

export function makeRouter(cfg: RouterConfig): RouteProvider {
  return async (waypoints, profile) => {
    if (waypoints.length < 2) return mockRoute(waypoints, profile);
    if (cfg.endpoint) {
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ waypoints, profile }),
      });
      if (!res.ok) throw new Error(`route ${res.status}`);
      const data = (await res.json()) as RouteResult;
      return { ...data, provider: data.provider ?? "custom" };
    }
    const base = cfg.osrmBaseUrl ?? "https://router.project-osrm.org";
    if (base) {
      try {
        return await osrmRoute(base, waypoints, profile);
      } catch {
        // CSP-blocked / offline / demo down → labeled mock, flow stays alive
        return mockRoute(waypoints, profile);
      }
    }
    return mockRoute(waypoints, profile);
  };
}

/* ── itinerary array helpers (pure) ──────────────────────────────────────── */

export const moveStop = <T>(arr: T[], from: number, to: number): T[] => {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = arr.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

/* stop letters A, B, C … Z, AA … for waypoint labels */
export const stopLabel = (i: number): string => {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};
