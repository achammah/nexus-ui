# Map depth v2 — blind-review response + user requirements

**Branch:** `feat/map-depth-v2` · PR #36. This addendum covers the blind-review HOLD and the two user requirements layered on the already-praised depth (6 basemaps, 3D buildings/tilt, routing, geocode, context menu, popups, tile-fallback, globe/Earth). None of that shipped depth was rebuilt or regressed — re-verified in the flat regression pass and the globe grid below.

All shots captured against a live `MapView` render, 114-place Western-Europe demo, desktop 1440×900 @2x, `reducedMotion: "no-preference"`, tiles live (`data-map-tiles="remote"`). State read off `data-map-*` attributes at capture.

## Per-finding status

### 1 — Default pin density (was-not-a-bug-in-the-shipped-default; harness was wrong) + guard added
The shipped default **clusters** at high density: `clustering.enabled` defaults `true`, threshold 25, and the demo has 114 sites — so the default render is clustered (shots `02`/`03` now show clusters 35/37/14/13/10/5, no pin wall). The earlier `02`/`03` pin-wall was a preview-harness artifact (clustering had been toggled off in that capture), not the shipped default — confirmed by reading `mapConfig.ts` `clustersOn` + the live `data-map-mode="cluster"` at default.

Added a **declutter guard** regardless: even with clustering toggled OFF, a dense set (> DOM cap, or above the cluster threshold on a wide/zoomed-out frame) now renders as compact **GPU points**, never a wall of DOM teardrops. Evidence `18-clusters-off-declutter.png` → `data-map-mode="points"`, `clusters="0"` — proportional GPU symbols, colored by category / sized by revenue. So no realistic config renders a raw teardrop wall. **Status: fixed (guard) + re-shot 02/03/18.**

### 2 — Projection ⟂ basemap orthogonal axes; Earth = named preset
Decoupled. `projectionMode` (the old 3-way flat/globe/earth that COUPLED earth to satellite/hybrid) is gone. Now:
- **Projection axis** = `flat | globe` (a live `setProjection`, no style reload).
- **Basemap axis** = any of the 6 styles, selectable under either projection.
- **Earth** = a named **preset** chip that composes the axes in one move: `globe + satellite imagery + tilt (pitch 55, zoom≤4.6)`. It lights up (`earthActive`, `aria-pressed`) whenever the live state already matches, whether reached by the chip or by hand.

Both app themes are deliberate, not an inverted dark: dark basemaps use CARTO dark-matter; the globe atmosphere halo (`applySky`) has hand-picked sky/horizon/fog colors per theme (`grid-globe-dark-dark` shows the deliberate dark sphere; `16-earth` shows the light-theme atmospheric rim). The Earth-vs-Globe curvature-loss symptom (old shot 16) was preset-coupling — now resolved: `16-earth.png` keeps full curvature + halo.

**Proof grid** (all `data-map-projection="globe"`, tiles remote):
`grid-globe-{streets,light,dark,satellite,hybrid,terrain}-{light,dark}.png` — every basemap × globe × both themes = 12 shots.
**Flat regression:** `flat-{streets,light,dark,satellite,hybrid,terrain}-light.png` — every style renders flat, pitch 0.
**Status: fixed.**

### 3 — All merged in ONE map view; switching preserves state
One `MapView`, one control surface. Projection toggle is a live `setProjection` that changes only the projection — viewport, markers, route, filters and the chosen style all carry across. Verified in `19-merged-preserve-globe.png`: searched to Brussels (zoom 12, streets), switched Flat→Globe → **after: zoom still 12.0, basemap still streets, mode still cluster** (logged `PRESERVE before/after`). No reset, no navigation feel. The picker presents projection + style as composable orthogonal controls, and the preset chip is additive — a parallel `arcglobe` deck.gl option slots into the same control surface without a redesign (coordinate at merge). **Status: fixed.**

### 4 — Streets vs Light swatches distinguishable
The Streets swatch now carries a road motif (white avenue + crossing yellow route + green park corner) over a warmer paper base; Light stays a plain neutral gradient. Clearly distinct in `04-maptype-menu.png`. **Status: fixed.**

## Bars
- `--nx-*` tokens throughout (picker, preset chip divider/outline, sky colors driven by theme).
- Light AND dark designed deliberately (grid covers both; dark is CARTO dark-matter + per-theme atmosphere, not an inversion).
- Mobile + config-composable unchanged (no regression).
- tsc clean for the map view (only pre-existing `@univerjs` errors in an untouched sibling block remain).

## Follow-up bug — "globe light/dark is buggy" (user report, fixed)

**Symptom:** switching a basemap style (or entering a preset) while in globe mode silently flattened the sphere to mercator and dropped the atmosphere halo; toggling the app theme on the globe didn't re-derive the sky.

**Root cause (reproduced with the harness, not guessed):** every basemap switch calls maplibre `setStyle`, which **resets the projection to mercator and wipes the sky**. The re-apply lived in the `onStyleData`/style-load handler, which fires too early to stick — `getProjection()` came back `UNDEFINED` (mercator) after every switch, and `getSky()` came back `{}`. So the globe only looked right until the first style change. The atmosphere was also keyed to the basemap's darkness, not the app theme, so a theme toggle never updated it.

**Fix (`b6d2370`):**
- Re-assert **projection + sky in `onIdle`** (fires after the new style paints), so globe + halo survive every basemap/preset change. Idempotent (guarded by a `getProjection().type !== want` check — no flip-flop).
- Key the atmosphere to the **app theme** via `--nx-bg` luminance (`isDarkColor`), re-resolved by `useTokenColors` on every theme flip — light theme → light sky/halo, dark theme → dark space.

**Verified (harness):** `getProjection()` = `globe` across streets→light→dark→streets switches (was `UNDEFINED`); `getSky()` flips `#7fb8e6`↔`#0b1026` on theme toggle and persists through switches. Fresh shots: `20-globe-light-theme-after-switch`, `21-globe-dark-theme-rederived`, `22-globe-dark-theme-dark-basemap`, `23-globe-light-theme-back` — proper sphere + per-theme halo in both themes, after a switch. The globe grid was re-shot post-fix (previously flat). The only console 404 is an Open Sans glyph `.pbf` (maplibre font fallback) — unrelated to the bug.

## Follow-up feature — FLY VIEW (trackpad tilt/rotate + one-click 3D)

User ask: "change orientation to have a full FLY VIEW like in Maps, so not always top view — also with TRACKPAD."

**Gesture handlers enabled/tuned** (explicit on `<MapGL>`): `dragRotate` (ctrl / right-drag rotates **and** tilts — `pitchWithRotate` is maplibre's default), `touchPitch` + `touchZoomRotate` (two-finger tilt/spin on mobile), `keyboard` (arrow steering). These carry maplibre's built-in inertia.

**Trackpad gesture (the headline).** A trackpad has no right-drag, and a plain two-finger drag is already zoom/pan — so repurposing it would break zoom. Instead: **⌥(alt) + two-finger** is the fly gesture — vertical → **pitch**, horizontal → **bearing**. Implemented as a capture-phase `wheel` listener on the map container that `preventDefault` + `stopImmediatePropagation` **before maplibre's scrollZoom sees it**, so the two gestures never fight. Plain scroll is untouched.

**Fly control (discoverability).** A `3D`/`2D` button beside the basemap picker: click → eases to an oblique pose (pitch 60); when already tilted/rotated → levels to top-down **and** north in one click. So there is both a one-click fly view and free gesture control; the compass in the nav control still handles bearing.

**Feel + safety.** All transitions use the existing eased `easeTo` (700–900 ms, `reduceMotion`-aware). Pitch is clamped to the config `maxPitch` (72) so the camera never drops under the horizon. Works in **flat and globe** — tilting the globe orbits the planet.

**Verified (harness, `reducedMotion: "no-preference"`):**
| Check | Result |
|---|---|
| Fly button (flat) | pitch 0 → 60 — `24-fly-flat-oblique.png` (horizon receding, minimap quad shows the pitch trapezoid) |
| Trackpad ⌥+wheel vertical | pitch 60 → **72** (clamped at maxPitch) — `25-fly-trackpad-tilt-spin.png` |
| Trackpad ⌥+wheel horizontal | bearing 0 → **−120** (spin) |
| Level via button | pitch 72 → 0, bearing → 0 |
| Globe + fly | pitch 60 + bearing −144 — `26-fly-globe-oblique.png`; zoomed-out orbit `27-fly-globe-orbit.png` / `28-fly-globe-orbit-dark.png` (tilted planet, limb + atmosphere halo, sites on the sphere, both themes) |
| Globe trackpad tilt | pitch 60 → 0 (push down reduces tilt) |
| **Regression** — plain scroll | zoom 6.0 → 6.6, **pitch unchanged** (alt-gate holds) |
| **Regression** — routing | 2 stops, route 357.9 km computed; 0 page errors |

## Map "work as a product" cluster

| # | Ask | Status | Evidence |
|---|---|---|---|
| A | 3D toggles show nothing | ✅ fixed | `29`/`30` — 0 extrusions top-down → enable → auto-reveal to z16.2/pitch 60 with 85 extrusions; `32` Alps relief |
| B | Light basemap reverts to Terrain | ✅ fixed (root cause was NOT the source) | 12 consecutive switches × 6 styles, all load + stay, 0 404s |
| C | Area measurement prominence + units | ✅ fixed | `33` live mid-draw, `34` on-shape label |
| D | Itinerary on All Sites | ✅ exposed | `35` — labelled Directions pill, 2-stop 347.7 km route |
| E | Fully mobile responsive | ✅ fixed (was partial when first written — see below) | `40`–`50` — directions + layers sheets, collapsible legend, touch tilt/rotate, 44px targets, at 390 AND 430 |

**A — 3D visibility.** Two causes. (1) Toggling a 3D layer off→on *removed and re-added* its layer, racing the style-load handler that re-applies augments on every `styledata`, so re-enabling could leave no layer at all. Buildings + raster hillshade now toggle layout `visibility` (add once, show/hide). (2) From top-down the layers are invisible by construction, so enabling either now eases the camera into the pose where it reads — pitch 60, and for buildings z16.2. **Honest data limitation:** OpenMapTiles `render_height` for these footprints is 0–3 m, so nearly every building falls to the ~8 m floor; that only reads as real mass from ~z16 — hence the zoom in the reveal. Building height also now reaches full value by z15 (was z16).

**B — basemap reliability. The Light source was never the problem** (style + tiles both 200 on repeated probes). The real cause: our cluster-count symbol layer declared no `text-font`, so maplibre used its default stack (`Open Sans Regular,Arial Unicode MS Regular`) which OpenFreeMap's glyph server does not host → a 404 on every vector basemap; and `onError` treated *any* error as a style failure, so that cosmetic miss tripped retry-then-revert. Fixed by pinning `text-font` to `Noto Sans Regular` (hosted by both OpenFreeMap and CARTO) and making `onError` ignore glyph/sprite/font errors. Also added the requested recovery: on a real failure the last-good style stays visible while the *chosen* one is probed with backoff (4s/10s/20s) and re-applied the moment it answers; the chip stays soft ("retrying…") until attempts are exhausted.

**D — routing config flag:** `route` in the map view config (`resolveMapOptions` → `tools.route`), **defaults to `true`** — routing was never disabled, just undiscoverable as an unlabeled rail icon. Now a labelled "Directions" pill (collapses to icon under 640px).

**E — mobile: COMPLETE.** *(This row read "partial — not done" for one round, before the focused mobile pass. It is recorded as done here because the code is at HEAD; the earlier state is kept only as history, not as a limit.)*

Built and verified:
- **Directions is a real bottom sheet** — drag handle, three snap points (PEEK = duration · distance · arrival → HALF → FULL scrollable turn-by-turn), map interactive above at every snap, from/to as search fields, mode chips touch-sized. Snap heights resolve against the **map container**, not the viewport: `dvh`-sized snaps overflowed above the map and pushed the drag handle off-screen.
- **Layers / basemap + projection is also a bottom sheet — ON PHONES ONLY.** Under the 768px breakpoint the picker is `position: fixed`, full-width, bottom-anchored, with a 40×4px grip, top-only corner radius, a 3-up swatch grid and 44/48px control rows. Above the breakpoint it stays a `position: absolute` dropdown anchored under its trigger — that is deliberate, not a gap.
  Measured at HEAD with the panel open: **390** → `fixed`, w390 @x0, bottom edge 844/844, grip 40×4, radius 14px top / 0 bottom, 3 equal columns. **430** → `fixed`, w430 @x0, bottom edge 932/932. **1440** → `absolute`, w232 @x28, bottom edge 379/900 (the dropdown, unchanged).
  ⚠ **Where to look — this is easy to miss and has been missed twice.** The picker-sheet rules live under the selectors `.nxMapTypePanel, .nxMapLayersPanel` inside `@media (max-width: 768px)` (map.css ~937–970), **not** under any `nxMapSheet*` name — those belong to the *directions* sheet. So `grep sheet map.css` returns only directions hits and reading the base `.nxMapTypePanel { position: absolute; top: calc(100% + 6px) }` rule at ~438 shows a dropdown. Both are true and neither is the whole picture: check the media-query override, or measure `getComputedStyle(panel).position` at 390px.
- **Legend collapses to a chip** that expands on tap (46px → 244px), so it no longer eats the phone screen. Desktop keeps it always-expanded.
- **Touch gestures verified with real CDP touch points**, not assumed from a registered handler: two-finger drag **tilts** (pitch 0 → 70) and a two-finger **twist rotates** (bearing 0 → −79), at both widths. A parallel two-finger sideways drag *pans* — that is correct maplibre behaviour, and measuring it as "rotation" is the mistake that made my first rotation test look like a pass.
- **Touch targets** — maplibre's own controls ship at 29–32px; those, the top control row, and the marker popup's actions (which shipped at **20px**) are now 44px. 0 sub-44px targets in shipped code.
- **Also verified at both widths:** projection control switches to globe, 3D buildings + terrain toggles both fire, geolocate reachable, cluster tap expands (z5 → z10), marker popup opens and fits (226×96), mobile-drawn area label reads correctly, no horizontal overflow, 0 page errors.

**Honest residual:** the mobile sheet treatment is gated at the 768px breakpoint, so **landscape phones (844×390) render the desktop popover**, not the sheet. That was verified to fit inside the 390px height (panel 232×244 @y136) with no overflow — it is a deliberate breakpoint choice, not an oversight, but it is not the sheet UI.

## Route alternatives

`alternatives=true` on the OSRM request; up to two extra routes parsed, capped at 3 total (Google-style). The panel renders them as selectable chips (duration + distance, primary tagged "fastest"); the chosen route draws in accent on top, the others draw **dimmed grey underneath and are clickable on the map** to switch. Selecting one updates the summary (duration · distance · arrival clock) and re-renders the turn-by-turn list. On mobile the options are **pinned into the sheet's always-visible region** (flex `order`, above the header) so they are reachable one-handed at the PEEK and HALF snaps — peek grows to 196px only when alternatives exist.

**Honest degradation — no fake chooser.** OSRM's demo profile returns alternatives only for some point pairs, and **never for multi-stop trips**. When it returns none, `options.length === 1` and the picker simply does not render: a single route, no "1 of 1" selector.

| Check | Result |
|---|---|
| options offered (Brussels→Antwerp) | 2 |
| switch via panel chip | 45,903 m → 53,247 m ✓ |
| switch via clicking the dimmed map line | 45,903 m → 53,247 m ✓ |
| summary + turn-by-turn follow the selection | ✓ |
| reachable at mobile PEEK snap | ✓ (sheet 196px, option at y455) |
| reachable at mobile HALF snap | ✓ |
| multi-stop (3 stops) | 1 option, picker hidden ✓ |

## Known limits — read this before extending or filing a bug

Each of these is a deliberate, verified constraint, not an oversight. The "what to do" column is the lever if you need to move past it. **None of them is faked anywhere in the UI** — where the data isn't real, the UI says so.

### 1. 3D building heights are mostly synthetic — buildings only read as mass from ~z16
The vector basemaps carry OpenMapTiles `building` geometry, but for most footprints (verified in central Brussels) `render_height` is **0–3 m** — i.e. effectively absent. The extrusion expression therefore applies an **~8 m floor** (`max(8, coalesce(render_height, height, 8))`) so untagged buildings have *some* mass without inventing towers. An 8 m block is only legible from about **z16**, which is why enabling "3D buildings" eases the camera to **z16.2 + pitch 60** rather than just tilting.
**What to do:** if you need true heights, point the style at a source whose `render_height` is populated (a commercial/own-hosted tile set). Don't raise the floor to fake mass — it produces uniform fake skylines. Buildings also require a **vector** basemap (streets/light/dark); on satellite/hybrid/terrain there is no building geometry and the toggle is correctly disabled.

### 2. The arrival clock is NOT traffic-aware
Arrival = **departure + route duration**, nothing more. The public OSRM demo has no traffic model. The UI labels this explicitly (`via OSRM · no traffic`) and never presents it as a live ETA.
**What to do:** wire a traffic-aware provider via the `routeEndpoint` config (an app route returning the `RouteResult` shape). The arrival clock then becomes as good as that provider.

### 3. Route alternatives are single-leg only, and often absent
`alternatives=true` is requested, but OSRM returns extra routes **only for some point pairs and never for multi-stop trips** (3+ stops always yields exactly one). When none come back the picker does not render at all.
**What to do:** nothing — an absent picker is correct behaviour, not a bug. Do not add a "1 of 1" chooser.

### 4. Geocoding is a documented SEAM — the default is a local mock
No geocoding vendor is hardcoded (no key can leak, no blocked host). `geocode.ts` defines the provider interface and ships a **deterministic local mock** that returns the real payload shape, marked `approximate` so the UI can label it. Address results in the search bar and in the directions from/to fields come from this mock unless a provider is wired. Record (site) results are always real.
**What to do:** set `geocodeEndpoint` to an app route that proxies a keyed vendor server-side (forward `?q=`, reverse `?lat=&lon=`) and returns the documented shape.

### 5. Routing itself falls back to a labelled mock
If OSRM is unreachable (offline, CI, CSP-blocked host), routing degrades to a densified great-circle path with synthesised steps, flagged `approximate` and surfaced as "estimate · est." in the panel. The itinerary UI is never empty and never silently wrong.
**What to do:** `osrmBaseUrl` (default `https://router.project-osrm.org`) or `routeEndpoint` for your own engine; `osrmBaseUrl: ""` forces mock-only.

### 6. Real 3D terrain (DEM) is a SEAM; the default relief is raster hillshade
"Terrain shading" ships **Esri raster hillshade** — CSP-safe, works everywhere, but it is a pre-rendered image, not an elevation mesh: the ground stays flat under it. A true mesh needs `terrainDemUrl` (terrarium raster-dem tiles, `terrainExaggeration` default 1.3), **off by default** because its host must be CSP-allowed.
**What to do:** set `terrainDemUrl` to a CSP-allowed DEM tile host. Also note relief is only *visible where there is relief* — flat urban areas legitimately show almost nothing; test over real terrain (e.g. the Alps) before concluding it is broken.

### 7. Transit and live traffic are not available
Both need a keyed vendor or a host outside the CSP allow-list. They are documented seams, off by default, **never faked**.

### 8. Basemap switch is a soft dip, not a true image crossfade
react-map-gl v8 does not expose `preserveDrawingBuffer` in its typed Map props, so an old-frame→new-frame snapshot crossfade would need an untyped escape hatch. Shipped instead: a blur + opacity dip on the canvas while the new style loads. It removes the hard flip; it is not a literal crossfade.

### 9. Smaller notes
- **Clusters-off at wide zoom renders GPU proportional symbols** (colour + size), not DOM teardrops. That is a deliberate second rendering mode, not clustering — clustering remains the default (`clustering.enabled: true`, threshold 25).
- **At 114 sites the render mode stays `cluster` at every zoom**, so individual sites are GL points, not DOM pins. Anything hit-testing markers must query the `map-point` layer, not `[data-testid^="map-marker-"]`. (This cost me two false "popup missing" failures.)
- **A few tile 404s log** when projection + basemap + tilt change together (aborted in-flight tile requests). Non-fatal; `tiles="remote"` throughout and renders land correctly.
- **Trackpad tilt is ⌥ + two-finger** (vertical = pitch, horizontal = bearing), deliberately NOT bare two-finger, which is trackpad zoom/pan. On touch it is a two-finger drag to tilt and a two-finger **twist** to rotate — a parallel sideways two-finger drag pans, by design.
- **`_preview`/`_shots` are a throwaway lane harness** (untracked); preview-only dev deps are kept OUT of the shipped `package.json`.
