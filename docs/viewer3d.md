# viewer3d — the 3D object / floor-plan surface

A page-level 3D viewer with two modes driven by one config blob. Object mode shows a
product/asset (glTF or a procedural preset) you can orbit, spin and inspect; floorplan
mode shows a multi-level building you can step through floor by floor. Both carry
data-driven, occlusion-aware hotspots that open a detail card.

The three.js engine is behind `LazyViewer3DSurface`: an app that declares no 3D page
pays ~0 eager bytes for it.

## Wire it up

```tsx
import * as React from "react";
import {
  LazyViewer3DSurface, seedScene, isViewer3dSnapshot, viewer3dStoreKey,
  type Viewer3DSnapshot,
} from "@ui/blocks/viewer3d";

function Viewer3DPage({ pageKey = "claim-4821" }: { pageKey?: string }) {
  const key = viewer3dStoreKey(pageKey);
  const [snap, setSnap] = React.useState<Viewer3DSnapshot>(() => {
    const stored = loadAppState(key);            // your app_state read
    return isViewer3dSnapshot(stored) ? stored : seedScene("vehicle");
  });
  const save = (next: Viewer3DSnapshot) => { setSnap(next); saveAppState(key, next); };

  return (
    <React.Suspense fallback={<div className="nxSkeleton" />}>
      <LazyViewer3DSurface value={snap} onChange={save} />
    </React.Suspense>
  );
}
```

`value` is the whole scene. `onChange` fires only when the viewer's own persisted
state changes (auto-rotate, active level) — it does not fire per frame. `reloadNonce`
forces a fresh engine mount from the current value. `actions` renders host controls
(save state, reset) into the toolbar's right end.

## The config (`Viewer3DSnapshot`)

| Field | Meaning |
|---|---|
| `mode` | `"object"` or `"floorplan"` — picks the whole surface behaviour |
| `title` | shown beside the mode kicker in the toolbar |
| `object.source` | `{ type: "gltf", url }` (self-hosted/bundled — strict CSP, no hotlinking) or `{ type: "procedural", preset: "sedan" }` (zero asset bytes) |
| `object.paint` | body color; any CSS color or token expression, default `var(--nx-accent)` |
| `floorplan.levels[]` | `{ id, name, elevation, height, rooms[] }` — one entry per floor |
| `floorplan.levels[].rooms[]` | `{ id, label, poly }` where `poly` is a closed `[x, z]` outline in metres (do not repeat the first point) |
| `hotspots[]` | `{ id, label, detail?, tone?, position: [x,y,z], level? }` — `tone` is `accent \| danger \| warn \| ok`; `level` scopes a hotspot to one floor |
| `autoRotate` | start spinning (withdrawn under prefers-reduced-motion) |
| `activeLevel` | which floor is live on load |
| `controls.presets` | show the front/side/top/iso buttons (default true) |
| `controls.wireframe` | show the wireframe toggle (default true, object mode) |

Hotspots are the integration seam: feed them from records rather than literals and the
viewer becomes a live inspection surface.

```ts
const snapshot: Viewer3DSnapshot = {
  version: 1, kind: "viewer3d", mode: "object",
  title: `Claim ${claim.ref}`,
  object: { source: { type: "gltf", url: "/models/vehicle.glb" } },
  hotspots: claim.damages.map((d) => ({
    id: d.id, label: d.part, detail: d.assessment,
    tone: d.severity === "high" ? "danger" : "warn",
    position: d.point,
  })),
};
```

## Tuning how it LOOKS

Every lighting, exposure, shadow, material and camera-feel parameter lives in one
object — `src/blocks/viewer3d/look.ts`. Nothing visual is hardcoded in the surface or
the builders.

```ts
import { LOOK } from "@ui/blocks/viewer3d";

LOOK.env.intensityDark = 0.9;        // lift the dark-theme environment
LOOK.ground.opacityLight = 0.18;     // softer contact shadow on light grounds
LOOK.materials.wallMixPct = 55;      // stronger floor-plan wall contrast
LOOK.camera.planDir = [1, 1.8, 1];   // steeper default look into the rooms
LOOK.feel.flyMs = 900;               // slower camera flights
```

Grouped as `renderer` (exposure, shadow map, pixel-ratio cap) · `env` (per-theme
environment intensity) · `lights` · `ground` (contact shadow) · `camera` (fov, framing
distance per mode, distance/polar clamps) · `feel` (damping, auto-rotate speed, fly and
spin durations, keyboard steps) · `materials`. Scene COLORS are not literals — they
derive from the live `--nx-*` tokens in `derivePalette`, so a theme or skin flip
re-derives the whole scene.

## Behaviour worth knowing

- **Framing** auto-fits to the model's bounds; distance and polar clamps stop the camera
  entering or passing under the model. Floor plans get their own steeper framing.
- **Hotspot occlusion** is a per-frame raycast: a marker behind geometry fades rather
  than floating over it. Room labels never paint over an interactive marker.
- **Reduced motion** withdraws the 360° spin and auto-rotate controls entirely and makes
  every camera move snap instead of fly.
- **Keyboard**: arrows orbit, `+`/`-` zoom, `R` (or `0`) resets. The canvas is a focusable
  `role="application"` with a description of its controls.
- **Lifecycle**: geometry, materials, the environment map and the GPU context are all
  released on unmount (`forceContextLoss`), so repeated navigations do not exhaust the
  browser's WebGL context budget.

## Assets

The seeded demos generate their geometry at runtime — no model files, no licensing, and
nothing to hotlink. For real models, bundle or self-host the `.glb`: the app runs under a
strict CSP that blocks external hosts. A missing or unreadable model lands on the error
state with a retry, not a blank canvas.
