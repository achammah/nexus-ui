# `record-core/views/map` — the map view

True at HEAD `f42829e`. Every measurement below was taken against this tree; where a claim could not be verified here it says so.

## What this folder IS

A registered **view type**. The registry picks up `definition.tsx` at build time, so the map is a dropped folder, never a switcher edit. It renders a list of records that carry coordinates as an interactive MapLibre surface: markers/clusters/heatmap, six basemaps, flat + globe projections, drawing and measurement, geocode search, multi-stop routing with turn-by-turn, a minimap, and a mobile layout with bottom sheets.

It is a **presentational view** in the ViewProps contract: it receives already-filtered `rows` and never re-filters them, reads and writes its own keys in the shared `viewState` bag, and calls host callbacks to open/patch/create records. It owns no data fetching.

Everything external is a **seam**: no vendor key is hardcoded anywhere, and every provider that needs one (geocoding, routing, DEM terrain, traffic, transit) has a documented interface with a local fallback, so the view is fully wired end-to-end offline and in CI.

## File map

| File | Lines | What it is |
|---|---|---|
| `MapView.tsx` | 1662 | The view component. All state, the MapLibre element, layers, interaction handlers, tile-failure recovery, and the overlay composition. Everything below is called from here. |
| `map.css` | 1032 | All styling. **See the media-query warning below — there is no single "mobile section".** |
| `overlays.tsx` | 503 | Chrome rendered over the canvas: `MapSearch`, `MapTypeMenu` (basemap + projection picker), `LayersPanel`, `DrawTools` rail, `Legend`, `ReadoutChips`. Presentational; state lives in `MapView`. |
| `ItineraryPanel.tsx` | 460 | The directions surface: A/B/C stop fields with autocomplete, route options, summary + arrival clock, depart-at, turn-by-turn list, and the mobile bottom-sheet snap logic. |
| `camera.ts` | 235 | Imperative MapLibre camera + augment application: `applyAugments` (3D buildings, hillshade, DEM terrain), `applySky` (globe atmosphere), `flyToPoint`, `zoomAroundPoint`, `viewportRing`. |
| `routing.ts` | 226 | Routing provider chain (custom endpoint → OSRM → local mock), OSRM parsing including alternatives, `RouteResult`/`RouteStep` types, stop helpers. |
| `mapConfig.ts` | 202 | `resolveMapOptions` (view config → typed `MapOptions`) plus the viewState-aware accessors (`activeBasemap`, `clustersOn`, `mapProjection`, …). **The precedence rule lives here.** |
| `basemaps.ts` | 175 | The six basemap specs (style URL or raster `StyleSpecification`), the token-only offline fallback style, `basemapProbeUrl` for recovery, and per-basemap capability flags. |
| `geo.ts` | 160 | Rows → geo: coordinate-field inference, `splitRows`, `toFeatureCollection`, marker radius scaling, `boundsOf`, and the view's `defaultConfig`/`validateConfig`. |
| `geomath.ts` | 133 | Pure spherical math, no browser: haversine, path length, polygon area, point-in-polygon/circle, centroid, and the `formatDistance`/`formatArea` unit scaling. Unit-testable under `node:test`. |
| `geocode.ts` | 130 | Geocoding **seam**: the provider interface plus a deterministic local mock returning the real payload shape. |
| `definition.tsx` | 101 | The `ViewDefinition` the registry consumes: component, icon, label, `defaultConfig`, `validateConfig`, and the `configSchema` that documents every config key. |
| `spiderfy.ts` | 78 | Fans out overlapping markers that a cluster cannot split further. |
| `ContextMenu.tsx` | 72 | The right-click menu (directions from/to here, what's here, add a point, zoom). |
| `Minimap.tsx` | 56 | The overview inset with the viewport quad (correct under rotation and pitch). |

## The model

### Rows → features

1. **Coordinate fields resolve config-first, then by inference.** `resolveMapOptions` takes `latField`/`lngField` from the view config; when absent, `inferCoordFields` picks the first NUMBER field whose **key** matches a lat/lng name pattern, falling back to matching the **label**. Only number fields are considered.
2. **`splitRows`** partitions rows into `located` (both coords valid and in range) and a **count** of the rest. Un-plottable rows are surfaced in a corner chip — they are never silently dropped, which matters when an adopter wonders why 108 records show 91 pins.
3. **`toFeatureCollection`** builds the GeoJSON fed to the GL source, carrying the optional `colorField` / `sizeField` / heatmap-weight values as feature properties so paint expressions can read them without a re-render.
4. **Marker size** scales between `MARKER_MIN_R` (6) and `MARKER_MAX_R` (22) across the observed `sizeExtent`; without a `sizeField` everything is `MARKER_DEFAULT_R` (9).

### Render mode — the trap that costs people hours

`renderMode` chooses between **clusters**, **DOM markers**, **GL points**, and **heatmap**. The rule that surprises everyone:

> With clustering enabled (default) and `locatedCount > clusterThreshold` (default 25), the mode is `cluster` **at every zoom level**. Individual sites are then **GL circle features on the `map-point` layer — not DOM pins.** Zooming in does not convert them into DOM markers.

So anything hit-testing a marker must query the `map-point` layer via `queryRenderedFeatures`, **not** `[data-testid^="map-marker-"]`. Two of my own test failures ("popup missing") were this, and they reproduced identically on desktop, which is what proved the tests were wrong rather than the product.

DOM markers appear only when clustering is off **and** the set is small enough or the camera close enough — see the declutter guard: above `DOM_MARKER_CAP` (400), or above the cluster threshold while below `DECLUTTER_ZOOM` (9), a clusters-off set renders as **GL proportional symbols** rather than a wall of teardrops. That is a deliberate second rendering mode, not clustering.

### Config vs viewState — the precedence rule

`viewConfig` is the authored default; `viewState` is the user's live, persisted override. Every accessor in `mapConfig.ts` implements the same precedence:

```ts
typeof viewState.<key> === "<type>" ? viewState.<key> : opts.<configDefault>
```

Keys the map owns in the shared `viewState` bag: `mapBasemap`, `mapProjection`, `mapPoints`, `mapClusters`, `mapHeatmap`, `mapBuildings3d`, `mapHillshade`, `clusterRadius`, `mapRouteProfile`, `mapTypeOpen`, `mapLayersOpen`. Nothing else in the bag belongs to this view; two views naming the same key share it deliberately.

Camera pose (centre/zoom/pitch/bearing) is **not** persisted — it is MapLibre's own state, seeded once from `initialViewState` and `fitBounds` on first rows.

### Authoring (creating records from the map)

```ts
const canAddPoint = opts.tools.addPoint && !readOnly && !!onCreateDraft;
```

**This three-way AND is the thing adopters get wrong** — enabling one third of it and then wondering why no button appears:

- `addPoint` — view config, **defaults `true`**.
- `readOnly` — a ViewProps prop from the host's permission model.
- `onCreateDraft` — a host callback. **The view cannot create records itself.** If the host does not pass it, the map is look-only no matter what the config says.

`doubleClickAction` (config, default `"zoom"`) switches double-click between zooming toward the cursor and dropping a record at the clicked point; the latter also requires `canAddPoint`.

> **Not verifiable in this repo:** the host-side wiring that supplies `onCreateDraft` on aggregate/page surfaces lives in the consuming app — this package is a component library and contains **no** host passing `onCreateDraft` (the prop is declared in `views/types.ts` and consumed by the map, calendar and flow views only). Multi-source pages leaving it undefined is a legitimate host choice, and the view degrades correctly to look-only.

## Seams — how to add X

**A basemap.** Add a `BasemapSpec` to `SPECS` in `basemaps.ts`: a style URL (vector) or a factory returning a raster `StyleSpecification`, plus `dark` (inverts control glyphs), `hasGlyphs` (whether the cluster-count symbol layer can mount) and `vector` (whether 3D building geometry exists). Add the id to `ALL_BASEMAPS`, a label, a `.nxMapTypeSwatch--<id>` swatch, and a `basemapProbeUrl` branch if it is raster. Keep it keyless and CSP-safe.

**A layer.** Add a `<Source>`/`<Layer>` pair inside the `MapGL` children in `MapView.tsx`. If it must survive a basemap switch, add it to `applyAugments` in `camera.ts` instead — `setStyle` wipes every custom layer, and `applyAugments` is re-applied on style load. **Toggle `visibility`, do not add/remove** (see Invariants).

**A marker renderer.** DOM markers are React `<Marker>` children; GL renderings are paint expressions on `map-point` / `map-clusters`. Adding a mode means extending `renderMode` and the `dataMode` attribute, and adding its layer id to `interactiveLayerIds` if it should be clickable.

**A directions provider.** Set `routeEndpoint` to an app route accepting `{waypoints, profile}` and returning the `RouteResult` shape; it takes precedence over OSRM. Or point `osrmBaseUrl` at your own OSRM (`""` forces mock-only). Traffic-aware ETAs arrive this way — see Limits.

**A geocoder.** Set `geocodeEndpoint` to an app route proxying a keyed vendor server-side (`?q=` forward, `?lat=&lon=` reverse) returning the `GeocodeResult` shape. Unset runs the local mock.

## Invariants and traps

### ⚠ Where to look: the mobile bottom sheets

**Three people got this wrong today with three different sloppy probes.** The basemap/layers picker becomes a bottom sheet on phones, but:

- The rules live on the selectors **`.nxMapTypePanel, .nxMapLayersPanel`** inside `@media (max-width: 768px)` — **map.css ~937–971**.
- They are **NOT** named `nxMapSheet*`. **That prefix is the DIRECTIONS sheet only** (`nxMapSheetGrip`, `nxMapSheetPeek`, …). A `grep sheet map.css` returns ~20 directions hits and **zero** picker hits.
- The base rule at **~438** is `.nxMapTypePanel { position: absolute; top: calc(100% + 6px) }` — a genuine dropdown that the media query overrides. Reading it alone tells you there is no sheet.

Both observations are true; neither is the whole picture. **The check that settles it** — measure, don't grep:

```js
// with the panel open, at a 390px viewport
getComputedStyle(document.querySelector('[data-testid="map-type-panel"]')).position
// "fixed"    → sheet   (full-width, bottom-anchored, ::before grip)
// "absolute" → dropdown (desktop, anchored under its trigger)
```

Measured at HEAD: **390** → `fixed`, w390 @x0, bottom edge 844/844, grip 40×4px, top-only 14px radius, 3-column swatch grid. **430** → `fixed`, w430, bottom edge 932/932. **1440** → `absolute`, w232 @x28.

### ⚠ There is no single "mobile section" in map.css

There are **nine separate `@media (max-width: 768px)` blocks** (~687, 850, 908, 973, 982, 987, 994, 1020, 1022) plus one at 640px, one `prefers-color-scheme: dark` and one `prefers-reduced-motion`. Mobile rules for a single component are spread across several of them. **Grep the selector, never scroll to "the mobile part"** — that fragmentation is the direct cause of the picker confusion above. Consolidating them is a welcome cleanup; until then, treat the file as selector-indexed, not section-indexed.

### Sheet snaps size against the MAP CONTAINER, not the viewport

The directions sheet's `peek`/`half`/`full` heights are `128px` / `55%` / `92%` **of the map container** (map.css ~887–889). `dvh`-based snaps overflowed the container, pushing the drag handle **above the top of the map and off-screen**. If you add a snap, keep it container-relative.

Peek has a second variant: `[data-snap="peek"][data-hasalts]` is **196px** (~1031), because when the engine returns route alternatives the option chips are pinned into the always-visible region (via flex `order`, above the header) so they stay reachable one-handed at peek. Without that extra height they rendered outside the visible sheet.

### `setStyle` resets the projection and wipes the sky

Every basemap switch calls `setStyle`, which resets the projection to mercator and clears `setSky`. Re-applying inside the style-load handler lands **too early to stick** (`getProjection()` came back `undefined` after every switch). Both are therefore re-asserted in **`onIdle`**, which fires after the new style paints. If you add style-dependent imperative state, re-assert it there too.

### Toggle layer `visibility` — never add/remove

Removing and re-adding a layer races the style-load handler that re-applies augments on every `styledata`, and could leave **no layer at all** — the "3D buildings is on but I see nothing" bug. `apply3dBuildings` and the raster hillshade both add once and then flip `visibility`.

### The gesture contract

- **Trackpad:** ⌥(alt) + two-finger — vertical = pitch, horizontal = bearing. Deliberately *not* bare two-finger, which is trackpad zoom/pan; hijacking it would break the more-used gesture. Implemented as a capture-phase `wheel` listener that `preventDefault` + `stopImmediatePropagation` **before MapLibre's scrollZoom sees it**, so the two never fight.
- **Touch:** two-finger drag **tilts**; rotation is a two-finger **TWIST**. A parallel two-finger sideways drag **pans** — correct MapLibre behaviour.
- ‼ **Testing the wrong gesture is how a rotation check passes without proving anything.** My first rotation test drove a parallel sideways drag, measured "no bearing change", and would have read as a pass on a naive assertion. Drive a real twist (two touch points rotating about a centre) and assert the bearing actually moved.

### Pitch is clamped

`maxPitch` defaults to 72 so the camera never drops under the horizon into nothing. The fly control eases to 60.

### Cosmetic errors must not condemn a basemap

`onError` ignores glyph/sprite/font failures. A missing glyph range once tripped the retry-then-revert path and bounced users onto another basemap — the map's own cluster-count layer requested a font the style's glyph server did not host. **Always set `text-font` explicitly** (`"Noto Sans Regular"`, hosted by both OpenFreeMap and CARTO); MapLibre's default stack is not hosted by these styles.

### Tiles-unreachable path — a sandboxed adopter WILL hit this

1. A style/tile error debounces 900ms into one verdict; a silent stall trips a 6s watchdog.
2. Up to `MAX_STYLE_RETRIES` (2) style re-fetches via a cache-busting nonce.
3. Still failing → **revert to the last-good basemap** (never a blank map) and show a soft chip.
4. Meanwhile the basemap the **user chose** is probed with backoff (4s/10s/20s, `MAX_RECOVERY_ATTEMPTS` 3) and **re-applied the moment it answers**. A fresh user pick supersedes recovery.
5. Only when attempts are exhausted does the chip harden to "unavailable · Retry".
6. If there is **no** last-good basemap (genuinely offline first load), the token-only `fallbackStyle` renders — a plain background on which markers, clusters, heatmap, draw, routes and popups all still work. `data-map-tiles="fallback"` marks it.

## Limits

Each is a verified constraint with its lever. None is faked in the UI — where the data is not real, the UI says so.

1. **3D building heights are mostly synthetic.** OpenMapTiles `render_height` is **0–3 m** for most footprints here, so an **~8 m floor** applies; that only reads as mass from **~z16**, which is why enabling 3D buildings *zooms* as well as tilts. Lever: a tile source with populated heights. **Do not raise the floor to fake mass** — it produces uniform fake skylines. Requires a vector basemap.
2. **The arrival clock is not traffic-aware.** Arrival = departure + duration; labelled `no traffic`. Lever: `routeEndpoint`.
3. **Route alternatives are single-leg only and often absent.** OSRM offers them for some pairs and **never for multi-stop**. An absent picker is *correct* — do not add a "1 of 1" chooser.
4. **Geocoding defaults to a local mock.** Record results are always real; address results are mocked until `geocodeEndpoint` is wired.
5. **Routing falls back to a labelled mock** when OSRM is unreachable, flagged `approximate` and shown as "estimate".
6. **DEM terrain is a seam.** The default "terrain shading" is Esri **raster hillshade** — an image, not a mesh, so the ground stays flat under it. Lever: `terrainDemUrl` (host must be CSP-allowed). Relief is only visible where relief exists; test over real terrain before concluding it is broken.
7. **Transit and live traffic are unavailable** — keyed vendors or off-CSP hosts. Documented seams, never faked.
8. **The basemap switch is a soft dip, not a true crossfade** — react-map-gl v8 does not expose `preserveDrawingBuffer` in typed props.
9. **The mobile sheets are gated at 768px, so they are PORTRAIT-PHONE ONLY.** A landscape phone at 844×390 is above the breakpoint and gets the desktop dropdown — it fits with no overflow, but it is not the one-handed layout. Lever: raise the breakpoint, or gate on orientation instead of width.
