# viewer3d — the 3D object / floor-plan surface

A page-level 3D viewer with two modes driven by one config blob.

**Object mode** shows a real product/asset: load a glTF/GLB or OBJ(+MTL) model from a
config URL, let the user drop a local model straight onto the stage, or fall back to a
procedural preset (zero asset bytes). Orbit, spin, camera presets, wireframe, PNG export
and data-driven, occlusion-aware hotspots.

**Floorplan mode** is a small drawing set, not one scene: a true 2D technical PLAN
(SVG linework with chain dimensions, door swings, window symbols, per-room areas, a
scale bar, north arrow and title block), an interactive 3D view, a sun-lit RENDER mode,
orthographic ELEVATION / SECTION / AXON views, a room SCHEDULE table, an interactive
measure tool and a metric/imperial toggle — all derived from one rooms+openings config,
so a number printed on the plan and a wall cut in 3D can never disagree.

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

`value` is the whole scene. `onChange` fires only when the viewer's own persisted state
changes (auto-rotate, active level, drawing view, units) — it does not fire per frame.
`reloadNonce` forces a fresh engine mount from the current value. `actions` renders host
controls into the toolbar's right end.

## The config (`Viewer3DSnapshot`)

| Field | Meaning |
|---|---|
| `mode` | `"object"` or `"floorplan"` — picks the whole surface behaviour |
| `title` | shown beside the mode kicker in the toolbar |
| `object.source` | `{ type: "gltf", url }` (.glb/.gltf) · `{ type: "obj", url, mtlUrl? }` · `{ type: "procedural", preset: "sedan" }` — URLs must be bundled/self-hosted (strict CSP, no hotlinking) |
| `object.scale` | multiplies the auto-fit size (models are normalized to ~4.5 m max dimension) |
| `object.up` | `"z"` rotates Z-up assets (common for CAD OBJ) to Y-up; default `"y"` |
| `object.allowImport` | show the Import button + drag-drop intake (default true) |
| `object.paint` | procedural body color; any CSS color or token expression, default `var(--nx-accent)` |
| `floorplan.levels[]` | `{ id, name, elevation, height, rooms[], openings?[] }` — one entry per floor |
| `…rooms[]` | `{ id, label, poly, roomType?, finish?, ceiling? }` — `poly` is a closed `[x, z]` outline in metres (do not repeat the first point); the optional fields feed the room schedule |
| `…openings[]` | `{ id, kind: "door"\|"window", edge: [[x,z],[x,z]], swing?, sill?, head? }` — `edge` is the opening's span lying ON a wall line; doors get a swing arc (2D) + header (3D), windows sill/glazing/header + the plan symbol |
| `floorplan.meta` | title-block data: `project, address, client, drawnBy, date, sheet, revision, scale?` (label like `"1:50"`; computed when omitted), `northDeg?` |
| `floorplan.wallThickness` | wall thickness in metres (default 0.15; interior partitions draw thinner on the plan) |
| `hotspots[]` | `{ id, label, detail?, tone?, position: [x,y,z], level? }` — `tone` is `accent \| danger \| warn \| ok`; hotspots render in 3D views AND as markers on the 2D plan |
| `autoRotate` | start spinning (withdrawn under prefers-reduced-motion) |
| `activeLevel` / `planView` / `units` | persisted viewer state: floor, drawing view (`plan · 3d · render · elevation · section · axon`), `metric`/`imperial` |
| `controls.presets` | camera-angle buttons (default true, object mode) |
| `controls.wireframe` | wireframe toggle (default true, object mode) |
| `controls.export` | PNG export button (default true) |
| `controls.schedule` | room-schedule panel (default true, floorplan) |

Hotspots are the integration seam: feed them from records rather than literals and the
viewer becomes a live inspection surface.

## Importing real models

Object mode accepts local files — an **Import model** button and drag-drop onto the
stage — with progress, size/format validation and errors that name the failure:

- **`.glb`** — single file. The recommended interchange format.
- **`.gltf`** — JSON glTF; drop it TOGETHER with its `.bin` and texture files (one
  multi-select or one drag). Relative references resolve through the dropped bundle.
- **`.obj` (+`.mtl` + textures)** — same multi-file drop. An OBJ without MTL gets a
  neutral material rather than rendering black.

Meshopt-compressed glTF decodes out of the box. **DRACO and KTX2/Basis are NOT decoded**
— their decoders are wasm side-files a host app must serve itself; such assets fail
with a plain error naming the compression. Imports are capped at 150 MB. Every model is
auto-centered, rested on the ground plane and normalized (`object.scale` multiplies).

A user-dropped file is **session-only**: a `File` cannot live in a JSON snapshot. Point
`object.source` at a bundled/self-hosted URL for a permanent model. The repo ships one
demo asset (`assets/toy-car.glb`, CC0 — see NOTICE.md) used by the demo page; it costs
nothing unless a page references it.

Replacing a model disposes the previous one's geometry, materials, textures and blob
URLs — imports don't accumulate GPU memory.

## The drawing set (floorplan views)

- **Plan** — 2D SVG technical drawing: deduped walls (shared partitions draw once,
  thinner), door swing arcs, window symbols, per-room name + envelope dims + area,
  chain dimensions (mm) + overall dims with extension lines and oblique ticks off the
  structural grid, scale bar, north arrow (`meta.northDeg`), title block, and a
  **Measure** tool (click two points; 5 cm snap). The sub-toolbar totals gross internal
  area per level and overall.
- **3D** — perspective orbit; the active level solid, others ghosted.
- **Render** — perspective with a **sun** (time-of-day slider 06:00–20:00 drives
  direction, warmth and intensity), whole building solid, real contact shadow.
- **Elevation** — true orthographic facade, N/S/E/W switch.
- **Section** — orthographic cut: long/cross axis + cut-position slider (a global
  clipping plane; cut faces are open, not capped).
- **Axon** — orthographic isometric of the whole building.
- **Schedule** — room table (area, W×D, ceiling, type, finish) with level totals and
  gross internal area, driven by the same polygons as the plan dims.
- **Units** — metric (m / m², dims in mm) ↔ imperial (ft-in / ft²) everywhere at once.
- **PNG** — plan view exports the SVG sheet at print resolution (3300 px wide); 3D
  views re-render at 3× pixel ratio. Both download directly.

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

Grouped as `renderer` (exposure, VSM shadow map, pixel-ratio cap) · `env` · `lights` ·
`ground` (contact shadow) · `camera` (fov, framing, clamps) · `feel` (damping, speeds,
keyboard steps) · `materials`. `SUN` (render-mode sun curve) and `ORTHO` (elevation/
section framing) sit beside `LOOK` in the same file. Scene COLORS are not literals —
they derive from the live `--nx-*` tokens (`derivePalette` for the 3D scene,
`derivePlanPalette` for the 2D sheet), so a theme or skin flip re-derives everything.

## Behaviour worth knowing

- **Framing** auto-fits the model's bounds (re-fit after every import); distance and
  polar clamps stop the camera entering or passing under the model.
- **Hotspot occlusion** is a per-frame raycast: a marker behind geometry fades.
- **Reduced motion** withdraws 360°/auto-rotate and makes camera moves snap.
- **Keyboard**: arrows orbit, `+`/`-` zoom, `R`/`0` resets (perspective views). The
  canvas is a focusable `role="application"` describing its controls; the plan is an
  `img`-role SVG with a text alternative naming rooms and area.
- **Mobile**: one-finger orbit + pinch zoom on the canvas; the plan sheet becomes a
  horizontally scrollable drawing; the toolbar wraps.
- **Lifecycle**: geometry, materials, textures, blob URLs, the environment map and the
  GPU context are all released on unmount (`forceContextLoss`).
- **Measurement math is exported** (`polyArea`, `roomDims`, `levelArea`, `formatArea`,
  `formatLen` from the light module) so a host can print the same figures in reports.

## Bundle

The lazy engine chunk (three.js + loaders + the drawing set) measures ~732 kB min /
~194 kB gzip in a vite production build — ~67 kB min (~20 kB gzip) over the previous
object-only viewer; the eager light module grew ~2 kB. The demo `.glb` (5.4 MB) is
referenced only by pages that opt into it.

## Editing — the plan is a drafting surface, not a picture

Floorplan mode is EDITABLE in place; every edit funnels through `plan-edit.ts`
(5 cm snap, min-room / min-opening clamps) and lands in the snapshot via
`onChange`, so a typed value and a dragged value obey identical rules and the
dims, areas, schedule and the 3D model all recompute from the same polygons.

- **Select** a room, wall, door or window in the plan — the **technical apron**
  (persistent right dock; `Panel` toggles it, `controls.schedule:false` removes it)
  shows its real spec: room name/type/finish/ceiling (editable) + area, envelope,
  volume, perimeter; opening width/sill/head (editable) + swing flip; wall length,
  thickness, face area, bounding rooms, openings.
- **Drag a wall** (axis-aligned) — the shared line moves: every room polygon on it,
  the openings riding it, the chain dims, areas, schedule totals and the 3D walls.
- **Drag a door/window** along its wall; resize by width in the apron.
- **A–A section marker** on the plan drags the 3D cut plane; double-click opens the
  section view. **Facade markers** (triangles on each side) open that elevation.
- **Layers** (dimensions / room labels / openings / markers), the **level tree**
  and the **sheet metadata** (title block) are all editable panes in the apron.
- The apron stays docked in every view (3D/render/elevation/section/axon) —
  drawing + technical panel is the screen, as in CAD. On narrow screens it
  stacks under the drawing as a bottom sheet.

## View transitions

Plan/3D/render/elevation/section/axon are views of ONE model, so switching is an
eased camera move, not a hard cut: perspective↔orthographic runs a dolly-zoom
(fov narrows as the camera pulls out, then the true ortho camera swaps in),
ortho↔ortho orbits between facades, and entering a section SWEEPS the clip plane
in from outside the building. The SVG plan cross-fades against the canvas.
`prefers-reduced-motion` snaps every one of these.
