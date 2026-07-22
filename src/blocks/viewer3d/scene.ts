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

/* Object mode loads either a bundled/served glTF (.glb/.gltf URL — the app runs
   under a strict CSP, so bundle or self-host the asset) or a procedural preset
   generated at runtime (zero asset bytes, license-free). */
export type Viewer3DModelSource =
  | { type: "gltf"; url: string }
  | { type: "procedural"; preset: "sedan" };

export interface Viewer3DObjectConfig {
  source: Viewer3DModelSource;
  /* paint color for the procedural preset's body; any CSS color or token
     expression (e.g. "var(--nx-accent)"). Default: the accent token. */
  paint?: string;
}

/* Floorplan mode: rooms are 2D polygons (x,z in meters) per level; the surface
   extrudes walls, lays floors, labels rooms at their centroid. */
export interface Viewer3DRoom {
  id: string;
  label: string;
  /* closed outline, [x, z] pairs in meters (do not repeat the first point) */
  poly: [number, number][];
}
export interface Viewer3DLevel {
  id: string;
  name: string;
  /* floor height above ground (m) */
  elevation: number;
  /* wall height (m) */
  height: number;
  rooms: Viewer3DRoom[];
}
export interface Viewer3DFloorplanConfig {
  levels: Viewer3DLevel[];
}

export interface Viewer3DSnapshot {
  version: 1;
  kind: "viewer3d";
  mode: Viewer3DMode;
  title?: string;
  object?: Viewer3DObjectConfig;
  floorplan?: Viewer3DFloorplanConfig;
  hotspots: Viewer3DHotspot[];
  /* persisted viewer state */
  autoRotate?: boolean;
  activeLevel?: string;
  /* chrome toggles a config can hide */
  controls?: {
    presets?: boolean;   // camera-angle buttons (default true)
    wireframe?: boolean; // wireframe toggle (default true, object mode)
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
    return !!o?.source && (o.source.type === "gltf" || o.source.type === "procedural");
  }
  const f = v.floorplan as { levels?: unknown } | undefined;
  return !!f && Array.isArray(f.levels) && (f.levels as unknown[]).length > 0;
}

/* ---- seeded demos ---- */

/* seedScene("vehicle") — an insurance-claim style car viewer: procedural sedan
   (no external asset, CSP-safe) with three damage hotspots.
   seedScene("floorplan") — a two-level house: 4 rooms down, 3 up, with two
   inspection hotspots. Both double as the deterministic journey fixtures. */
export function seedScene(kind: "vehicle" | "floorplan" = "vehicle"): Viewer3DSnapshot {
  if (kind === "floorplan") {
    return {
      version: 1,
      kind: "viewer3d",
      mode: "floorplan",
      title: "24 Elm Street — floor plan",
      floorplan: {
        levels: [
          {
            id: "ground",
            name: "Ground floor",
            elevation: 0,
            height: 2.7,
            rooms: [
              { id: "living", label: "Living room", poly: [[0, 0], [5.2, 0], [5.2, 4.4], [0, 4.4]] },
              { id: "kitchen", label: "Kitchen", poly: [[5.2, 0], [8.6, 0], [8.6, 3.2], [5.2, 3.2]] },
              { id: "hall", label: "Hall", poly: [[5.2, 3.2], [8.6, 3.2], [8.6, 4.4], [5.2, 4.4]] },
              { id: "wc", label: "WC", poly: [[8.6, 0], [10, 0], [10, 2], [8.6, 2]] },
              { id: "office", label: "Office", poly: [[8.6, 2], [10, 2], [10, 4.4], [8.6, 4.4]] },
            ],
          },
          {
            id: "first",
            name: "First floor",
            elevation: 3.0,
            height: 2.5,
            rooms: [
              { id: "bed1", label: "Main bedroom", poly: [[0, 0], [4.6, 0], [4.6, 4.4], [0, 4.4]] },
              { id: "bed2", label: "Bedroom 2", poly: [[4.6, 0], [7.8, 0], [7.8, 4.4], [4.6, 4.4]] },
              { id: "bath", label: "Bathroom", poly: [[7.8, 0], [10, 0], [10, 4.4], [7.8, 4.4]] },
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
