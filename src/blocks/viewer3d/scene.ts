/* Viewer3D block — light module (NO three.js import here). Types, store key,
   snapshot guard and the two seeded demo scenes stay in the eager bundle; the
   WebGL engine loads only inside Viewer3DSurface's lazy chunk (same split as the
   workbook block). */

/* A free-surface 3D viewer persists as ONE snapshot blob under an app-state key —
   NOT record data. Namespaced so several standalone viewer pages can coexist. */
export const VIEWER3D_STORE_PREFIX = "viewer3d:";
export const viewer3dStoreKey = (pageKey: string): string => `${VIEWER3D_STORE_PREFIX}${pageKey}`;

/* ---- config / snapshot shape (the page's `value`) ---- */

export type Viewer3DMode = "object" | "floorplan";
export type HotspotTone = "accent" | "danger" | "warn" | "ok";
export type Viewer3DUnits = "metric" | "imperial";

/* floorplan views — PLAN is a true 2D technical drawing (SVG), the rest are the
   WebGL engine under different cameras/render treatments */
export type PlanView = "plan" | "3d" | "render" | "elevation" | "section" | "axon";

/* A hotspot pins to a world-space point on the model / plan. Data-driven: the
   host feeds these from config or records; the surface renders + projects them. */
export interface Viewer3DHotspot {
  id: string;
  label: string;
  /* body of the detail card the hotspot opens */
  detail?: string;
  tone?: HotspotTone;
  /* world position in scene units (meters) */
  position: [number, number, number];
  /* floorplan only — which level the hotspot belongs to */
  level?: string;
}

/* Object mode loads a bundled/served model (the app runs under a strict CSP, so
   bundle or self-host the asset), or a procedural preset generated at runtime
   (zero asset bytes, license-free). Users can also drop a local file straight
   onto the stage — that import is session-only (a File cannot persist in a
   JSON snapshot); the snapshot records its name so the UI can say what loaded. */
export type Viewer3DModelSource =
  | { type: "gltf"; url: string }
  | { type: "obj"; url: string; mtlUrl?: string }
  | { type: "procedural"; preset: "sedan" };

export interface Viewer3DObjectConfig {
  source: Viewer3DModelSource;
  /* multiplies the auto-fit size (auto-normalizes to ~4.5 m max dimension) */
  scale?: number;
  /* source up-axis; "z" rotates Z-up assets (common for OBJ from CAD) to Y-up */
  up?: "y" | "z";
  /* allow the user to import a local model file (drag-drop + button, default true) */
  allowImport?: boolean;
  /* paint color for the procedural preset's body; any CSS color or token
     expression (e.g. "var(--nx-accent)"). Default: the accent token. */
  paint?: string;
}

/* Floorplan mode: rooms are 2D polygons (x,z in meters) per level; the surface
   extrudes walls, lays floors, labels rooms — and derives real measurements
   (areas, dimensions, the room schedule) from these polygons. */
export interface Viewer3DRoom {
  id: string;
  label: string;
  /* closed outline, [x, z] pairs in meters (do not repeat the first point) */
  poly: [number, number][];
  /* room schedule columns (all optional) */
  roomType?: string;   // e.g. "Habitable", "Wet room", "Circulation"
  finish?: string;     // floor finish, e.g. "Oak 14mm"
  ceiling?: number;    // ceiling height override (m); defaults to the level height
}

/* An opening (door/window) lies ON a wall line: `edge` is the opening's own span
   [from, to] in plan coordinates — it must sit on a room-polygon edge (colinear).
   The 3D builder cuts the wall there; the 2D plan draws the swing arc / glazing. */
export interface Viewer3DOpening {
  id: string;
  kind: "door" | "window";
  edge: [[number, number], [number, number]];
  /* door swing: which side of the wall the leaf opens to (+1 left of from→to) */
  swing?: 1 | -1;
  /* window sill / head heights (m above the level floor) */
  sill?: number;
  head?: number;
}

export interface Viewer3DLevel {
  id: string;
  name: string;
  /* floor height above ground (m) */
  elevation: number;
  /* wall height (m) */
  height: number;
  rooms: Viewer3DRoom[];
  openings?: Viewer3DOpening[];
}

/* Title-block + drawing conventions for the technical plan */
export interface Viewer3DPlanMeta {
  project?: string;    // "24 Elm Street"
  address?: string;
  client?: string;
  drawnBy?: string;
  date?: string;       // printed as-is
  sheet?: string;      // "A-101"
  revision?: string;
  /* drawing scale label, e.g. "1:50"; omitted → computed from the layout */
  scale?: string;
  /* plan-north rotation in degrees (0 = up) */
  northDeg?: number;
}

export interface Viewer3DFloorplanConfig {
  levels: Viewer3DLevel[];
  meta?: Viewer3DPlanMeta;
  /* wall thickness in meters (default 0.15) */
  wallThickness?: number;
}

/* drawing layers the plan/apron can toggle; absent = visible */
export interface Viewer3DLayers {
  dims?: boolean;
  labels?: boolean;
  openings?: boolean;
  hotspots?: boolean;
}

/* a selected drawing element (plan-editing + the properties apron) */
export type Viewer3DSelection =
  | { kind: "room"; level: string; id: string }
  | { kind: "opening"; level: string; id: string }
  | { kind: "wall"; level: string; a: [number, number]; b: [number, number] }
  | null;

/* ---- claims workspace (object mode + claim config) ----
   The 3D/photo stage is ONE pane of a decision workspace: an activity/audit
   rail and machine assessment on the left, the multi-modal stage in the centre
   (model · photos · documents, switchable), and the DECISION surface on the
   right — the human adjudicates, adjusts the amount, and submits. */

export type ClaimSeverity = "minor" | "moderate" | "severe";

/* damage annotation ANCHORED to the geometry — authored + verifiable */
export interface ClaimAnnotation {
  id: string;
  label: string;
  part?: string;            // body panel / component
  severity: ClaimSeverity;
  note?: string;
  author?: string;          // "Agent" | adjuster name
  verified?: boolean;
  position: [number, number, number];
  photoRef?: string;        // attachment id backing this finding
}

export interface ClaimAttachment {
  id: string;
  name: string;
  kind: "photo" | "pdf" | "model";
  url?: string;             // bundled/self-hosted/data URI (strict CSP)
  status?: "verified" | "flagged" | "pending";
  caption?: string;
}

export interface ClaimActivityEvent {
  id: string;
  time: string;             // printed as-is (HH:MM:SS)
  text: string;
  tone?: "ok" | "info" | "warn" | "danger";
}

export interface ClaimCheck { id: string; label: string; status: "pass" | "warn" | "fail" }

export interface ClaimAssessment {
  verdict: string;          // "Recommend Partial Approval"
  rationale?: string;
  checks: ClaimCheck[];
  reasoning?: string;       // the model's prose justification
}

export interface ClaimDecision {
  choice?: "approve" | "partial" | "deny";
  amount?: number;
  reason?: string;
  note?: string;
  submittedAt?: string;     // set on submit
}

export interface ClaimSummaryMeta {
  claimant?: string;
  policy?: string;
  type?: string;
  incidentDate?: string;
  location?: string;
  claimedAmount?: number;
  deductible?: number;
  currency?: string;        // "EUR"
  vehicle?: string;         // "2022 Ford Mustang"
  vin?: string;
  adjuster?: string;
}

export interface Viewer3DClaimConfig {
  summary?: ClaimSummaryMeta;
  activity?: ClaimActivityEvent[];
  assessment?: ClaimAssessment;
  attachments?: ClaimAttachment[];
  annotations?: ClaimAnnotation[];
  decision?: ClaimDecision;
}

export interface Viewer3DSnapshot {
  version: 1;
  kind: "viewer3d";
  mode: Viewer3DMode;
  title?: string;
  object?: Viewer3DObjectConfig;
  floorplan?: Viewer3DFloorplanConfig;
  /* present → the object viewer hosts the full claims workspace */
  claim?: Viewer3DClaimConfig;
  hotspots: Viewer3DHotspot[];
  /* persisted viewer state */
  autoRotate?: boolean;
  activeLevel?: string;
  units?: Viewer3DUnits;
  planView?: PlanView;
  layers?: Viewer3DLayers;
  /* the technical apron (properties/layers/levels/schedule dock) — default open */
  apron?: boolean;
  /* chrome toggles a config can hide */
  controls?: {
    presets?: boolean;   // camera-angle buttons (default true)
    wireframe?: boolean; // wireframe toggle (default true, object mode)
    export?: boolean;    // PNG export button (default true)
    schedule?: boolean;  // room-schedule panel (default true, floorplan)
  };
}

/* A stored value is usable only if it carries the viewer's minimal shape; a
   missing/foreign/corrupt blob fails this and the surface recovers to a seed. */
export function isViewer3dSnapshot(x: unknown): x is Viewer3DSnapshot {
  if (!x || typeof x !== "object") return false;
  const v = x as Record<string, unknown>;
  if (v.kind !== "viewer3d" || (v.mode !== "object" && v.mode !== "floorplan")) return false;
  if (!Array.isArray(v.hotspots)) return false;
  if (v.mode === "object") {
    const o = v.object as { source?: { type?: string } } | undefined;
    return !!o?.source && (o.source.type === "gltf" || o.source.type === "obj" || o.source.type === "procedural");
  }
  const f = v.floorplan as { levels?: unknown } | undefined;
  return !!f && Array.isArray(f.levels) && (f.levels as unknown[]).length > 0;
}

/* ---- seeded demos ---- */

/* seedScene("vehicle") — an insurance-claim style car viewer: procedural sedan
   (no external asset, CSP-safe) with three damage hotspots.
   seedScene("floorplan") — a two-level house with doors/windows, room schedule
   data and a title block. Both double as the deterministic journey fixtures. */
/* tiny inline SVG "photo" placeholders — CSP-safe demo attachments */
const demoPhoto = (label: string, hue: number): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="640" height="420" fill="hsl(${hue},14%,88%)"/><rect x="60" y="120" width="520" height="180" rx="90" fill="hsl(${hue},22%,62%)"/><circle cx="180" cy="300" r="46" fill="hsl(${hue},18%,30%)"/><circle cx="460" cy="300" r="46" fill="hsl(${hue},18%,30%)"/><text x="320" y="70" text-anchor="middle" font-family="sans-serif" font-size="26" fill="hsl(${hue},20%,35%)">${label}</text></svg>`,
  )}`;

/* seedScene("claim") — the full claims workspace over the vehicle stage */
export function seedClaim(): Viewer3DSnapshot {
  const base = seedScene("vehicle");
  return {
    ...base,
    title: "Claim CLM-2026-4821",
    hotspots: [],
    claim: {
      summary: {
        claimant: "Sarah Chen",
        policy: "POL-2026-8841",
        type: "Auto Collision",
        incidentDate: "2026-03-28",
        location: "Munich, Germany",
        claimedAmount: 3600,
        deductible: 500,
        currency: "EUR",
        vehicle: "2022 sedan",
        vin: "1FA6P8TH4N5100482",
        adjuster: "You",
      },
      activity: [
        { id: "a1", time: "10:42:22", text: "Claim received from Sarah Chen", tone: "info" },
        { id: "a2", time: "10:42:25", text: "Policy lookup complete — full comprehensive coverage", tone: "ok" },
        { id: "a3", time: "10:42:28", text: "4 attachments ingested — 3 photos verified, 1 estimate", tone: "ok" },
        { id: "a4", time: "10:42:30", text: "Repair estimate flagged — EUR 3,600 is 40% above regional benchmark", tone: "warn" },
        { id: "a5", time: "10:42:36", text: "Flagged for human review", tone: "warn" },
      ],
      assessment: {
        verdict: "Recommend Partial Approval",
        rationale: "Damage is consistent with the reported incident; the estimate exceeds the regional benchmark.",
        checks: [
          { id: "c1", label: "Coverage confirmed", status: "pass" },
          { id: "c2", label: "Incident date matches report", status: "pass" },
          { id: "c3", label: "Estimate EUR 3,600 vs 2,500 benchmark", status: "warn" },
          { id: "c4", label: "Prior claims: none / 24 mo", status: "pass" },
        ],
        reasoning: "Photos corroborate a single front-quarter impact. Parts and labour rates in the submitted estimate run 40% above the regional average for this damage class; a partial approval at the benchmark amount is consistent with policy terms.",
      },
      attachments: [
        { id: "att-model", name: "3D inspection model", kind: "model", status: "verified", caption: "Interactive model" },
        { id: "att-front", name: "front_damage_IMG_4281.jpg", kind: "photo", url: demoPhoto("Front damage", 12), status: "verified" },
        { id: "att-rear", name: "rear_check_IMG_4290.jpg", kind: "photo", url: demoPhoto("Rear — no impact", 140), status: "verified" },
        { id: "att-est", name: "repair_estimate.pdf", kind: "pdf", status: "flagged", caption: "EUR 3,600 — above regional avg" },
      ],
      annotations: [
        { id: "an-1", label: "Front impact damage", part: "Bumper cover", severity: "severe", note: "Cover cracked, grille displaced. Replace cover + respray.", author: "Agent", verified: true, position: [2.28, 0.62, 0.42], photoRef: "att-front" },
        { id: "an-2", label: "Door dent", part: "LF door", severity: "moderate", note: "~12 cm dent, paint intact — PDR candidate.", author: "Agent", verified: true, position: [0.55, 0.86, 0.98] },
        { id: "an-3", label: "Windshield chip", part: "Windshield", severity: "minor", note: "Stone chip, no crack propagation. Resin fill.", author: "Agent", verified: false, position: [0.7, 1.28, -0.42] },
      ],
      decision: { choice: "partial", amount: 2500, reason: "Estimate above regional benchmark" },
    },
  };
}

export function seedScene(kind: "vehicle" | "floorplan" = "vehicle"): Viewer3DSnapshot {
  if (kind === "floorplan") {
    return {
      version: 1,
      kind: "viewer3d",
      mode: "floorplan",
      title: "24 Elm Street — floor plan",
      units: "metric",
      planView: "plan",
      floorplan: {
        wallThickness: 0.15,
        meta: {
          project: "24 Elm Street",
          address: "24 Elm Street, Ghent",
          client: "Claim #4821",
          drawnBy: "Nexus",
          date: "2026-07-22",
          sheet: "A-101",
          revision: "B",
          northDeg: 15,
        },
        levels: [
          {
            id: "ground",
            name: "Ground floor",
            elevation: 0,
            height: 2.7,
            rooms: [
              { id: "living", label: "Living room", roomType: "Habitable", finish: "Oak 14 mm", poly: [[0, 0], [5.2, 0], [5.2, 4.4], [0, 4.4]] },
              { id: "kitchen", label: "Kitchen", roomType: "Wet room", finish: "Porcelain 600", poly: [[5.2, 0], [8.6, 0], [8.6, 3.2], [5.2, 3.2]] },
              { id: "hall", label: "Hall", roomType: "Circulation", finish: "Porcelain 600", poly: [[5.2, 3.2], [8.6, 3.2], [8.6, 4.4], [5.2, 4.4]] },
              { id: "wc", label: "WC", roomType: "Wet room", finish: "Ceramic 300", ceiling: 2.4, poly: [[8.6, 0], [10, 0], [10, 2], [8.6, 2]] },
              { id: "office", label: "Office", roomType: "Habitable", finish: "Oak 14 mm", poly: [[8.6, 2], [10, 2], [10, 4.4], [8.6, 4.4]] },
            ],
            openings: [
              { id: "d-front", kind: "door", edge: [[6.3, 4.4], [7.2, 4.4]], swing: 1 },
              { id: "d-living", kind: "door", edge: [[5.2, 3.5], [5.2, 4.3]], swing: -1 },
              { id: "d-kitchen", kind: "door", edge: [[5.8, 3.2], [6.6, 3.2]], swing: 1 },
              { id: "d-wc", kind: "door", edge: [[8.6, 1.1], [8.6, 1.8]], swing: 1 },
              { id: "d-office", kind: "door", edge: [[8.6, 3.3], [8.6, 4.1]], swing: -1 },
              { id: "w-living-front", kind: "window", edge: [[1.0, 4.4], [3.4, 4.4]], sill: 0.9, head: 2.2 },
              { id: "w-office-front", kind: "window", edge: [[8.9, 4.4], [9.7, 4.4]], sill: 0.9, head: 2.2 },
              { id: "w-living-s", kind: "window", edge: [[1.2, 0], [3.6, 0]], sill: 0.9, head: 2.2 },
              { id: "w-living-w", kind: "window", edge: [[0, 1.4], [0, 3.0]], sill: 0.9, head: 2.2 },
              { id: "w-kitchen", kind: "window", edge: [[6.2, 0], [7.8, 0]], sill: 1.1, head: 2.2 },
              { id: "w-office", kind: "window", edge: [[10, 2.6], [10, 3.8]], sill: 0.9, head: 2.2 },
            ],
          },
          {
            id: "first",
            name: "First floor",
            elevation: 3.0,
            height: 2.5,
            rooms: [
              { id: "bed1", label: "Main bedroom", roomType: "Habitable", finish: "Carpet", poly: [[0, 0], [4.6, 0], [4.6, 4.4], [0, 4.4]] },
              { id: "bed2", label: "Bedroom 2", roomType: "Habitable", finish: "Carpet", poly: [[4.6, 0], [7.8, 0], [7.8, 4.4], [4.6, 4.4]] },
              { id: "bath", label: "Bathroom", roomType: "Wet room", finish: "Ceramic 300", ceiling: 2.3, poly: [[7.8, 0], [10, 0], [10, 4.4], [7.8, 4.4]] },
            ],
            openings: [
              { id: "d-bed1", kind: "door", edge: [[4.6, 3.3], [4.6, 4.1]], swing: 1 },
              { id: "d-bath", kind: "door", edge: [[7.8, 3.3], [7.8, 4.1]], swing: -1 },
              { id: "w-bed1", kind: "window", edge: [[1.0, 0], [3.4, 0]], sill: 0.9, head: 2.1 },
              { id: "w-bed2", kind: "window", edge: [[5.4, 0], [7.0, 0]], sill: 0.9, head: 2.1 },
              { id: "w-bath", kind: "window", edge: [[10, 1.6], [10, 2.8]], sill: 1.2, head: 2.1 },
              { id: "w-bed1-front", kind: "window", edge: [[0.8, 4.4], [3.0, 4.4]], sill: 0.9, head: 2.1 },
              { id: "w-bed2-front", kind: "window", edge: [[5.0, 4.4], [6.9, 4.4]], sill: 0.9, head: 2.1 },
              { id: "w-bath-front", kind: "window", edge: [[8.3, 4.4], [9.5, 4.4]], sill: 1.2, head: 2.1 },
            ],
          },
        ],
      },
      hotspots: [
        { id: "h-leak", label: "Water damage", detail: "Ceiling stain under the bathroom — plumbing leak traced to the bath waste. Repair scheduled.", tone: "danger", position: [8.8, 2.4, 2.2], level: "ground" },
        { id: "h-window", label: "Window replaced", detail: "Double glazing fitted March 2026 under claim #4821.", tone: "ok", position: [2.3, 4.2, 0.05], level: "first" },
      ],
      activeLevel: "ground",
      autoRotate: false,
    };
  }
  return {
    version: 1,
    kind: "viewer3d",
    mode: "object",
    title: "Claim #4821 — 2022 sedan",
    object: { source: { type: "procedural", preset: "sedan" } },
    hotspots: [
      { id: "d-bumper", label: "Front impact", detail: "Bumper cover cracked, grille displaced. Estimate: replace cover + respray. Severity: moderate.", tone: "danger", position: [2.28, 0.62, 0.42] },
      { id: "d-door", label: "Door dent", detail: "Left front door panel dented (~12cm), paint intact. Paintless dent repair candidate.", tone: "warn", position: [0.55, 0.86, 0.98] },
      { id: "d-glass", label: "Windshield chip", detail: "Stone chip lower passenger side, no crack propagation. Resin fill approved.", tone: "ok", position: [0.7, 1.28, -0.42] },
    ],
    autoRotate: true,
  };
}
