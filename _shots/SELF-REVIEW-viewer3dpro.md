# Self-review — viewer3d depth pass ("pro"): model import + architect drawing set

Branch `feat/viewer3d-pro` on top of the merged base viewer. Everything below was
exercised live against the dev build at HEAD (Playwright-driven, DOM-asserted, then
screenshotted); the evidence PNGs in this folder were retaken after the last code
change they depict.

## What was built on top of the base viewer

1. **Real model import** (`loaders.ts` + surface intake UI)
   - glTF/GLB, `.gltf`+`.bin`+textures and OBJ(+MTL+textures) from a config URL, a
     file picker or drag-drop; multi-file bundles resolve through a blob-URL
     LoadingManager; meshopt decodes out of the box.
   - Progress bar, 150 MB cap, extension validation, plain-language errors naming
     the cause (verified live: wrong extension, corrupt GLB, missing MTL degrades to
     a neutral material instead of black or a crash).
   - Auto-center / rest-on-ground / normalize (+ `scale`, `up:"z"` config), full
     disposal of the replaced model (geometry, materials, textures, blob URLs).
   - Demo asset: Khronos **ToyCar** committed at `src/blocks/viewer3d/assets/toy-car.glb`
     — **CC0 1.0** per the model's upstream metadata; recorded in NOTICE.md.
2. **Architect floor-plan set**
   - **2D technical PLAN** (`Plan2D.tsx`, SVG): deduped double-weight walls
     (exterior/interior), door swing arcs, window symbols, per-room name +
     envelope dims + area, chain dimensions (mm) + overall dims with extension
     lines and oblique ticks, scale bar, north arrow, title block (project /
     client / drawn / date / sheet / rev / scale), measure tool (two clicks,
     5 cm snap — measured 5.20 m across the living room, exact), hotspot markers.
   - **Views**: 3D perspective (level ghosting), RENDER (sun slider 06:00–20:00 →
     direction/warmth/intensity + strong contact shadow), ELEVATION N/S/E/W
     (true orthographic, facade-fit), SECTION (long/cross + cut slider via a
     clipping plane), AXON (orthographic isometric).
   - **Room schedule**: area, W×D, ceiling, type, finish per room; level totals;
     gross internal area. All numbers derive from the same `plan-geometry.ts`
     math as the plan and the 3D walls (verified: 22.9 m² living, 44.0 m²/level,
     88.0 m² total, 947 ft² imperial — hand-checked shoelace values).
   - **Openings in 3D**: doors cut with headers, windows with sill/glazing/header,
     built from the SAME opening spans the 2D symbols use.
   - **Units** metric↔imperial everywhere; **PNG export** — plan sheet at 3300 px
     print res, any 3D view at 3× (both intercepted live: 361 KB and 967 KB PNGs).
3. **Craft**: VSM soft shadows, ACES + sRGB (base), facade-fit ortho framing,
   token-derived palettes for scene AND sheet (dark plan reads as a blueprint),
   rebuilt sedan (real wheel arches in the silhouette, greenhouse + roof cap,
   five-spoke wheels, seams/handles/mirrors/grille/plates).

## Defects found by probing (not by reading my own code)

- **Mirrored floor slabs (pre-existing, shipped in the base PR)**: `rotateX(π/2)` +
  mesh `scale.z = -1` parked every floor slab OUTSIDE the building (box.min.z −6.6
  on a 4.4 m-deep house) — inflating the fit box and mis-centering sections. Fixed
  in `buildLevel` (double-sided slab, no mirror), verified box = ±2.275.
- **ResizeObserver clobbered the ortho frustum** when the contextual sub-toolbar
  resized the stage — elevations went tiny/huge. Fixed via `engine.orthoHalfH`.
- **Plan glazing was car-glass navy** — unreadable slots in light rooms; re-derived
  as a pale translucent plan-glass material.
- **South facade had no openings in the seed** — elevations read as a gray slab;
  the seed now has a real front facade (door + 5 windows over two floors).

## Parity table (feature → reference tool → this → verdict)

| Feature | Reference | Here | Verdict |
|---|---|---|---|
| Import GLB drag-drop | Sketchfab / three.js editor | GLB/GLTF+bin/OBJ+MTL, progress, errors, auto-fit | ✅ credible |
| DRACO/KTX2 assets | Sketchfab (server-side) | not decoded; named error + docs | ⚠ honest gap |
| PBR look | Sketchfab embed | IBL + ACES + VSM soft shadows; no SSAO/bloom | ✅ good, not flagship |
| 2D plan linework | Revit/Archicad sheet | walls/doors/windows/dims/scale bar/north/title block | ✅ reads as a drawing |
| Dimensions | Revit auto-dims | structural-grid chains + overall + per-room + measure | ✅ real numbers |
| Room schedule | Revit schedule view | table w/ totals, GIA, ceilings, finishes | ✅ |
| Elevations/sections | Revit | ortho facades + clip-plane cuts, no cut-poché/caps | ⚠ credible-lite |
| Walkthrough | Matterport | none (out of scope for config-driven plans) | ❌ not attempted |
| Sun study | Enscape | azimuth/elevation/warmth by hour, cast shadows | ✅ simple but real |
| Print/PDF set | Revit sheets | per-view print-res PNG | ⚠ PNG only |

**Would an architect take it seriously?** As a *presentation and inspection* surface,
yes — the plan sheet carries the conventions they expect (chain dims in mm, swing
arcs, title block, scale bar, schedule, GIA) and every number is real. As a *design
tool*, no — there is no drafting, no wall poché on sections, no PDF sheet set, no
IFC/DWG. That is the right scope for a config-driven claims/real-estate viewer.
**Would a claims adjuster take the car viewer seriously?** With an imported model of
the actual vehicle class — yes (that path is first-class now). The procedural sedan
is a decent placeholder, clearly secondary.

## What is true / what breaks / what to do

- **True**: all features above exercised at HEAD; tsc clean for the block (the 45
  pre-existing workbook/univer errors on main are untouched); light+dark designed;
  mobile wraps (plan scrolls horizontally, touch orbit unchanged from base).
- **Breaks / limits**:
  - DRACO/KTX2 models fail (named error). Fix path: host serves the decoders; a
    `decoders` config could wire `setDecoderPath` in ~20 lines.
  - Sections are open cuts (no caps/poché) — reads fine on solid walls, but purists
    will notice.
  - Plan assumes mostly-orthogonal rooms for chain dims (non-ortho geometry still
    draws + measures; the chains fall back to bbox stops).
  - Reduced-motion behavior is inherited from the base (spin/auto-rotate withdrawn,
    flights snap) — code paths unchanged, not re-verified in this pass.
  - A user-dropped file is session-only by design (File ≠ JSON snapshot).
- **Bundle** (vite prod build of the demo, min/gzip): lazy engine chunk 732.4 kB /
  194.2 kB vs 665.4 kB / 174.0 kB base → **+67 kB min / +20 kB gzip** for loaders +
  the whole drawing set. Eager index +2.2 kB. The 5.4 MB demo GLB is opt-in.

## Evidence (this folder, all at HEAD)

`pro-plan-light-final.png` (2D sheet, dims+scale+north+title block) ·
`pro-plan-dark.png` · `pro-plan-first-schedule.png` (schedule + first floor) ·
`pro-3d-fixed.png` · `pro-elev3.png` (south elevation) · `pro-section-dark3.png` ·
`pro-render2.png` (sun 09:00, cast shadows) · `pro-axon.png` ·
`pro-car-side2.png` / `pro-car-iso.png` / `pro-car-dark.png` (rebuilt sedan) ·
`pro-toycar.png` (CC0 GLB via config URL) · `pro-import.png` (user file import) ·
`pro-mobile-plan.png` (390 px).

---

# Addendum — TRUE-CAD pass (apron · editability · transitions)

User verdict driving this pass: "not editable on each view … just flat, still feel
like a toy … no animation between views … nothing NEXT to the floor plan, no
technical info … would have needed to be like a TRUE CAD software."

## Shipped (all exercised live at HEAD, DOM/state-asserted)

1. **Technical APRON** (`Apron.tsx`) — persistent CAD dock beside the drawing, in
   EVERY view: selected element's editable spec (room name/type/finish/ceiling +
   area/volume/perimeter; opening width/sill/head + door swing flip; wall length/
   thickness/face/bounding-rooms/openings), layer toggles (dims/labels/openings/
   markers), clickable level tree, editable sheet/title-block metadata, and the
   room schedule as a docked pane whose rows select in the plan. Bottom sheet on
   mobile. Verified: rename "Living room"→"Salon" propagated to plan label,
   schedule row AND the persisted snapshot; ceiling/type/finish/north all commit.
2. **Editable plan** (`plan-edit.ts` + Plan2D direct manipulation) — click-select
   rooms/walls/openings; DRAG A WALL and everything follows (verified: partition
   x 5.2→6.0: living 22.9→26.4 m², kitchen 10.9→8.3 m², chain dims 6000/2600, the
   door ON the wall moved with it, snapshot persisted, and the 3D model rebuilt
   with the partition at the new position); drag a door along its wall (slide
   verified, 0.9 m width preserved), resize by width (1.20 m verified), flip
   swing; A–A section marker on the plan drags the 3D cut plane; facade triangles
   jump to that elevation (verified: east marker → elevation view, East pressed).
   All edits snap 5 cm with min-room (0.6 m) / min-opening clamps, and flow
   through the SAME functions as the apron's typed fields.
3. **View transitions** — eased camera moves instead of hard cuts (verified by
   sampling engine state mid-flight): 3D→elevation dolly-zooms (fov 42→5 while
   pulling out, then the true ortho camera swaps in — fov read 34.8 mid-anim),
   elevation→section orbits the ortho camera while the clip plane SWEEPS in from
   outside the building (constant 4.26→0.0 observed), section→3D returns to
   fov 42 with clipping cleared. The SVG plan cross-fades against the canvas.
   `prefers-reduced-motion` snaps (same guard as all prior motion).

## Honest limits (new)

- Wall drag covers AXIS-ALIGNED walls (the overwhelming case for room-polygon
  plans); a skewed wall selects and reads its spec but does not drag.
- Colinear wall runs that meet at a T (living's full edge over kitchen+hall
  edges) are separate deduped segments; dragging the full-height segment moves
  all colinear vertices in its span (correct), but the plan renders the overlap
  at the thicker weight — a CAD purist would split walls at junctions.
- No room-polygon vertex editing or room creation/deletion yet — the editable
  unit is walls/openings/attributes, not topology.
- Live wall drag persists per pointermove (host onChange fires often); fine for
  app_state, hosts with expensive persistence should debounce.
- Transition edge case: changing the A–A position DURING a view fly is applied
  after the fly completes (the anim owns the clip constant until done).

## Bundle after the CAD pass

Lazy chunk 751.6 kB min / 200.0 kB gzip (base viewer 665.4/174.0; import+drawing
set 732.4/194.2) → the apron + editing + transitions cost ~19 kB min / ~6 kB gzip.

## New evidence (committed)

`cad-apron-plan.png` — edited plan (Salon 6.00 m, slid front door, kitchen
selected + tinted) with dims recomputed, A–A marker, facade markers, and the
apron showing the kitchen's editable spec + docked schedule.
`cad-transition-mid.png` — axon view with the apron docked (the CAD screen:
drawing + technical panel in every view).
