# viewer3d — self-review

**Reference (the bar):** Sketchfab's embedded viewer and a car-configurator product page —
a model that lands already well-framed, camera moves that feel eased rather than snapped,
markers that behave like they are attached to the geometry (not floating over it), and
chrome that reads as the product's own, not a vendor widget.

**Verification:** `_shots/verify-viewer3d.mjs`, 30 assertions, 30 PASS, run against a real
GPU backend (`--use-angle=metal`). Every assertion reads live engine state (camera
position, `controls.autoRotate`, material flags, ghost opacity, occlusion classes) or a
visible DOM outcome — not render-presence. Shots at `reducedMotion:"no-preference"`,
dpr 2 (dpr 3 on mobile).

> Default headless Chromium falls back to SwiftShader (CPU) and runs this scene at ~9fps,
> which silently turns any per-frame assertion into a measurement of the renderer. The
> suite pins the GPU backend for that reason.

## Per-feature verdict

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | Load glTF/GLB | ✓ | loader path + normalize (center, rest on floor, scale to ~4.5m); exercised via the error path with a bad URL. **Gap: not exercised with a real .glb** — see Gaps |
| 1 | Procedural model (no asset) | ✓ | `f-object-light.png` — extruded-silhouette sedan, zero asset bytes |
| 1 | Orbit / zoom / pan | ✓ | `f-object-after-drag.png`; drag moves the camera >0.5 units; wheel zoom clamped both ends |
| 1 | 360° spin | ✓ | `f-object-mid-spin.png`; rotates then returns to start (<0.6 units) |
| 1 | Auto-rotate + reduced-motion | ✓ | sweeps 16.7°/2s when on; control withdrawn entirely under `prefers-reduced-motion` |
| 1 | Reset view | ✓ | returns to fit distance (6.98) from any camera |
| 1 | Camera presets + easing | ✓ | `f-object-preset-{front,side,top,iso}.png`; 4 distinct positions, eased flight, instant under reduced motion |
| 1 | Auto-fit framing | ✓ | fits bounding sphere; **aspect-corrected** so a 390px portrait stage frames the whole model (`f-mobile-object.png`) |
| 1 | Distance + polar clamps | ✓ | 25 wheel-ins stop at d=1.88 (cannot enter the model); polar clamped below the horizon (cannot fly under) |
| 1 | Environment + soft ground shadow | ✓ | PMREM RoomEnvironment + directional key, shadow catcher scaled to model radius |
| 1 | Wireframe toggle | ✓ | `f-object-wireframe.png`; material flags asserted |
| 2 | Extruded walls, room polygons | ✓ | `f-plan-light.png` / `f-plan-dark.png` |
| 2 | Multi-floor + level switcher | ✓ | `f-plan-level-first.png`; 5 rooms → 3, inactive level ghosted to 0.07 |
| 2 | Room labels legible at angle | ✓ | projected DOM pills, uppercase micro type; stay on-screen top-down; never painted over by a marker |
| 2 | Top-down ↔ 3D toggle | ✓ | `f-plan-topdown.png`; eased both ways, returns to the plan's own framing |
| 3 | Hotspots pinned to the model | ✓ | per-frame projection, transforms only (no React state per frame) |
| 3 | Detail card on click | ✓ | `f-object-hotspot-card.png`, `f-plan-hotspot-card.png` |
| 3 | Occlusion-aware | ✓ | `f-object-occlusion.png`; from -Z, 2 pins behind geometry fade, the line-of-sight pin does not |
| 3 | Data-driven | ✓ | hotspots come from the snapshot; floorplan hotspots filter by level (1 per floor) |
| 4 | Loading / poster | ✓ | `viewer3d-loading` poster before the engine paints |
| 4 | Error + retry | ✓ | `f-error-state.png`; bad URL → error state with a working retry, not a blank canvas |
| 5 | Frame rate | ✓ | 60.3fps @dpr1, 47.3fps @dpr2 (2880×1636, 2048 soft shadows) on an M4 Pro |
| 5 | Dispose on unmount | ✓ | geometry, materials, environment map, PMREM, controls, renderer |
| 5 | No WebGL context leak | ✓ | 14 unmount/remount cycles, canvas still painting, 0 context warnings; `forceContextLoss()` on teardown |
| 6 | House contract | ✓ | `Viewer3DSurface` value/onChange/reloadNonce, one snapshot blob, `viewer3dStoreKey`, `isViewer3dSnapshot`, `seedScene` seeding both demos, exported from `src/index.ts` |
| — | Light + dark | ✓ | both demos shot in both; scene colors derive from `--nx-*` and re-derive on flip |
| — | Mobile 390px | ✓ | `f-mobile-object.png`, `f-mobile-plan-dark.png`, `f-mobile-after-touch-orbit.png`; touch orbit works, toolbar wraps within 390px |
| — | Keyboard + a11y | ✓ | `f-object-keyboard.png`; focusable `role="application"` with a described control set; arrows orbit, +/- zoom, R reset |

## Defects found and fixed during review (not shipped)

1. **Floor plan was near-invisible in light mode** — walls mixed 88% toward the page
   background, so white walls sat on a white ground. Now a tunable mix (`wallMixPct`).
2. **Floor plan framed like an object** — the object iso preset shows a building's outside
   walls, not its rooms. Plan mode now has its own steeper direction, distance and aim.
3. **Room labels painted over hotspot labels** ("Water damag" clipped by the WC pill) —
   overlay z-order now puts interactive markers above passive labels.
4. **Model overflowed portrait viewports** — auto-fit used vertical fov only, and read
   `camera.aspect` before the ResizeObserver had sized it. Both fixed; desktop framing is
   unchanged by construction (the correction is identity at/above the reference aspect).
5. **GPU context not hard-released** — `renderer.dispose()` alone leaves the context alive
   until GC, so repeated navigations walk toward the browser's ~16-context cap.

Two suite failures were **test** defects, not product defects, and were corrected after
probing the live engine rather than by loosening the assertion: the object run measured a
"returns to start" spin while the seed's auto-rotate was still drifting the camera, and
the occlusion check used a viewpoint whose rays genuinely pass over the hood.

## Where the craft pass tunes

Everything visual is in **`src/blocks/viewer3d/look.ts`** — one `LOOK` object, exported
from the block. The surface and the builders contain no visual magic numbers. Groups:
`renderer` (exposure, tone mapping, shadow map size/radius/bias, pixel-ratio cap) ·
`env` (per-theme environment intensity, PMREM blur) · `lights` (hemi + key colors,
intensity, direction — the key rides model radius so shadow softness is scale-stable) ·
`ground` (contact-shadow opacity per theme, radius, frustum, plan scale-down) ·
`camera` (fov, per-mode framing direction/distance, clamps, reference aspect) ·
`feel` (damping, auto-rotate speed, fly/spin durations, keyboard steps) ·
`materials` (paint/glass/tire/metal/lamps/wall/floor, ghost opacity, plan legibility mixes).
Scene COLORS are not literals — `derivePalette` resolves them from live `--nx-*` tokens.

## Honest gaps

- **No real .glb was loaded.** The glTF path is written and its failure path is verified,
  but every shot is procedural geometry. A bundled CC0 model would prove normalize/scale/
  shadow behaviour on real meshes. This is the one place I would not claim "verified".
- **The sedan is a good schematic, not a beautiful car.** It reads correctly at a glance
  and carries damage markers convincingly; it will not pass for a configurator asset.
- **Light mode still reads pale** next to the dark theme, which is genuinely handsome.
  The dials exist (`wallMixPct`, `env.intensityLight`, `ground.opacityLight`) — I set them
  to legible, not to beautiful.
- **The ground shadow is a plain shadow-catcher**, not a contact-hardening/AO pass; it can
  read slightly detached from the model at low camera angles.
- **Mobile framing sits low** in a very tall stage — the model fits, but is not optically
  centered.
- **No resize re-fit.** The camera frames on mount; rotating a phone mid-session keeps the
  old distance (the ResizeObserver updates aspect, not framing).
- **Shared walls double up** (each room extrudes its own edges), invisible at this scale
  but wrong if a config ever needs per-wall materials or openings (doors/windows).

## DoD

- [x] Object viewer: load, orbit/zoom/pan, spin, auto-rotate, presets, reset, auto-fit, clamps, env + shadow, wireframe
- [x] Floor plan: extruded walls, multi-floor switcher, room labels, top-down ↔ 3D
- [x] Hotspots: data-driven, pinned, occlusion-aware, detail card
- [x] States: loading, error + retry, poster
- [x] Perf + hygiene: 47–60fps, full disposal, no context leak across 14 navigations
- [x] Lazy engine: ~0 eager bytes for an app with no 3D page
- [x] House contract + exported from `src/index.ts`; config documented (`docs/viewer3d.md`)
- [x] Light + dark, mobile 390px, keyboard + a11y, reduced-motion
- [ ] "Topnotch" visual verdict — the craft pass's call, not self-certified
