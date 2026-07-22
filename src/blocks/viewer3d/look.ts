/* Viewer3D LOOK — the ONE place every visual + camera-feel parameter lives.
   Nothing here is behaviour: it is exposure, lighting, shadow softness, material
   response, camera framing and easing. Tuning the viewer's look means editing
   THIS file; Viewer3DSurface and builders.ts read from it and hold no magic
   numbers of their own.

   Colors are NOT hardcoded here — they derive from the live --nx-* tokens in
   `derivePalette` below, so a theme or skin flip re-derives the whole scene. The
   only literals are physically-neutral (tire black, chrome grey, lamp emissive):
   values that read as materials, not as brand. */

import { isDarkTheme, resolveCssColor } from "../workbook/workbook-theme";

/* ---- camera presets: the direction the camera sits FROM the model center ---- */
export type Preset = "front" | "side" | "top" | "iso";
export const PRESET_DIRS: Record<Preset, [number, number, number]> = {
  front: [1, 0.3, 0.12],
  side: [0.03, 0.26, 1],
  top: [0.02, 1, 0.02],
  iso: [1, 0.62, 1],
};

/* easing for every camera move (in-out quad) */
export const EASE = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export interface Viewer3DLook {
  renderer: {
    antialias: boolean;
    /* devicePixelRatio is capped here — the single biggest perf/quality dial */
    pixelRatioCap: number;
    toneMappingExposure: number;
    shadowMapSize: number;
    /* PCFSoft blur radius in shadow-map texels */
    shadowRadius: number;
    shadowBias: number;
  };
  env: {
    /* RoomEnvironment PMREM blur — higher = softer, less specular detail */
    blur: number;
    intensityLight: number;
    intensityDark: number;
  };
  lights: {
    hemi: { sky: string; ground: string; intensity: number };
    /* key light position is expressed in MODEL RADII so it scales with content */
    key: { color: string; intensity: number; dir: [number, number, number] };
  };
  ground: {
    /* contact-shadow catcher radius, in model radii */
    radiusMul: number;
    opacityLight: number;
    opacityDark: number;
    /* shadow-camera half-extent + depth, in model radii */
    frustumMul: number;
    farMul: number;
    /* a building casts one huge hard slab — scale the catcher down in plan mode */
    planOpacityMul: number;
  };
  camera: {
    fov: number;
    near: number;
    far: number;
    /* framing distance in model radii: default/preset, top-down, and the clamps
       that stop the user flying inside or under the model */
    fitMul: number;
    topMul: number;
    /* a floor plan is read from ABOVE — a building framed on the object preset
       shows you its outside walls, not its rooms. Steeper default + own distance. */
    planDir: [number, number, number];
    planFitMul: number;
    /* where the plan camera aims, as a fraction of the model's height above its
       floor — 0 sits on the slab, 1 at the top of the tallest (ghosted) level */
    planTargetFrac: number;
    /* fitMul/planFitMul are calibrated at THIS viewport aspect; narrower stages
       (a phone in portrait) pull the camera back so the model still fits across */
    refAspect: number;
    minDistanceMul: number;
    maxDistanceMul: number;
    /* just under PI/2 — keeps the camera above the ground plane */
    maxPolarAngle: number;
  };
  feel: {
    damping: number;
    autoRotateSpeed: number;
    /* ms for a preset/reset fly and for one full 360 spin */
    flyMs: number;
    spinMs: number;
    /* keyboard: radians per arrow press, and zoom factor per +/- press */
    keyOrbitStep: number;
    keyPolarStep: number;
    keyZoomIn: number;
    keyZoomOut: number;
  };
  materials: {
    paint: { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number };
    glass: { metalness: number; roughness: number; opacity: number };
    tire: { roughness: number };
    metal: { metalness: number; roughness: number };
    lampHead: { emissiveIntensity: number };
    lampTail: { emissiveIntensity: number };
    wall: { roughness: number };
    floor: { roughness: number };
    /* inactive floors in a multi-level plan */
    ghostOpacity: number;
    /* how far the plan's walls / alternating floor slabs are pulled OFF the page
       background toward the foreground color — the whole legibility of the plan
       in LIGHT mode lives on these two (white walls on a white ground vanish). */
    wallMixPct: number;
    floorAltMixPct: number;
  };
}

export const LOOK: Viewer3DLook = {
  renderer: {
    antialias: true,
    pixelRatioCap: 2,
    toneMappingExposure: 1,
    shadowMapSize: 2048,
    shadowRadius: 6,
    shadowBias: -0.0004,
  },
  env: { blur: 0.04, intensityLight: 1.0, intensityDark: 0.75 },
  lights: {
    hemi: { sky: "#ffffff", ground: "#8a8578", intensity: 0.5 },
    key: { color: "#ffffff", intensity: 1.6, dir: [0.62, 1.6, 0.37] },
  },
  ground: { radiusMul: 4, opacityLight: 0.24, opacityDark: 0.42, frustumMul: 2.2, farMul: 12, planOpacityMul: 0.35 },
  camera: {
    fov: 42,
    near: 0.05,
    far: 500,
    fitMul: 2.6,
    topMul: 2.2,
    planDir: [1, 1.5, 1],
    planFitMul: 2.95,
    planTargetFrac: 0.22,
    refAspect: 1.82,
    minDistanceMul: 0.7,
    maxDistanceMul: 6,
    maxPolarAngle: Math.PI * 0.495,
  },
  feel: {
    damping: 0.08,
    autoRotateSpeed: 1.4,
    flyMs: 700,
    spinMs: 2600,
    keyOrbitStep: 0.12,
    keyPolarStep: 0.1,
    keyZoomIn: 0.88,
    keyZoomOut: 1.14,
  },
  materials: {
    paint: { metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.18 },
    glass: { metalness: 0.2, roughness: 0.08, opacity: 0.88 },
    tire: { roughness: 0.85 },
    metal: { metalness: 0.85, roughness: 0.3 },
    lampHead: { emissiveIntensity: 0.7 },
    lampTail: { emissiveIntensity: 0.6 },
    wall: { roughness: 0.95 },
    floor: { roughness: 1 },
    ghostOpacity: 0.07,
    wallMixPct: 64,
    floorAltMixPct: 14,
  },
};

/* ---- token -> scene colors, resolved for the CURRENT theme ---- */

export interface ScenePalette {
  paint: string;      // car body
  glass: string;
  dark: string;       // tires, trim
  metal: string;      // hubs, mirrors
  headEmissive: string;
  tailColor: string;
  tailEmissive: string;
  wall: string;
  wallEdge: string;
  floor: string;
  floorAlt: string;
}

/* three paints REAL colors while the canvas stays transparent (the page ground
   is pure CSS) — so every scene color is read back off the live tokens here. */
export function derivePalette(paint?: string): ScenePalette {
  const r = resolveCssColor;
  return {
    paint: r(paint || "var(--nx-accent)"),
    glass: r("color-mix(in srgb, #0d1320 90%, var(--nx-accent))"),
    dark: "#1a1b1e",
    metal: "#b9bdc6",
    headEmissive: "#cfd8e8",
    tailColor: "#7a1420",
    tailEmissive: "#a11326",
    wall: r(`color-mix(in srgb, var(--nx-bg-raised) ${LOOK.materials.wallMixPct}%, var(--nx-fg))`),
    wallEdge: r("var(--nx-border-strong)"),
    floor: r("var(--nx-bg-sunken)"),
    floorAlt: r(`color-mix(in srgb, var(--nx-accent) ${LOOK.materials.floorAltMixPct}%, var(--nx-bg-sunken))`),
  };
}

/* the theme-dependent scalars, in one place */
export const envIntensity = (): number => (isDarkTheme() ? LOOK.env.intensityDark : LOOK.env.intensityLight);
export const groundShadowOpacity = (isPlan = false): number =>
  (isDarkTheme() ? LOOK.ground.opacityDark : LOOK.ground.opacityLight) * (isPlan ? LOOK.ground.planOpacityMul : 1);

/* the default framing direction + distance for a mode */
export const fitFor = (mode: "object" | "floorplan"): { dir: [number, number, number]; mul: number } =>
  mode === "floorplan"
    ? { dir: LOOK.camera.planDir, mul: LOOK.camera.planFitMul }
    : { dir: PRESET_DIRS.iso, mul: LOOK.camera.fitMul };

/* Framing distance for a bounding radius, corrected for the stage's aspect.
   A vertical fov alone frames the model's HEIGHT; on a portrait stage the model
   is then far too wide and gets cropped left/right. At or above refAspect this
   returns exactly r * mul, so desktop framing is unchanged. */
export function fitDistance(r: number, aspect: number, mul: number): number {
  const v = (LOOK.camera.fov * Math.PI) / 180;
  const half = (a: number) => Math.min(v, 2 * Math.atan(Math.tan(v / 2) * a)) / 2;
  const ratio = Math.sin(half(LOOK.camera.refAspect)) / Math.sin(half(Math.max(aspect, 0.2)));
  return r * mul * Math.max(1, ratio);
}
