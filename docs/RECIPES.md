# Recipes

Task-oriented guides for record-core surfaces. Each recipe is self-standing: the config keys, their defaults, and the seams a real deployment wires.

## Give an object a map view

Add a `map` entry to the object's `views` (or set `defaultView: "map"`). The view plots records that carry a latitude and a longitude number field, and takes the surface to Google-Maps depth: six map types with a crossfade on switch, 3D buildings and shaded relief, an eased camera (fly, double-click-to-zoom, drag-tilt/rotate), multi-stop turn-by-turn directions, clustering, a heatmap, draw and measure, address search with reverse geocode, a right-click context menu, and an overview minimap.

```jsonc
{
  "type": "map",
  "latField": "lat",         // required: a number field, -90..90
  "lngField": "lng",         // required: a number field, -180..180
  "titleField": "name",      // marker title + popup heading (defaults to the primary field)
  "colorField": "category",  // a select field: markers + heatmap take its option colors
  "sizeField": "revenue"     // a number/currency field: marker radius scales to it
}
```

Every capability is config-composable, each with a sensible default (it works out of the box) and overridable. Coordinate and colour inference means the two required keys are often inferred from field names (`lat`/`latitude`, `lng`/`lon`/`long`/`longitude`).

### Config surface

**Map types (basemaps).** All keyless and CSP-safe (OpenFreeMap, CARTO, Esri, OpenTopoMap).

| Key | Default | Notes |
|---|---|---|
| `basemaps` | all six | the offered set: `streets`, `light`, `dark`, `satellite`, `hybrid`, `terrain` |
| `defaultBasemap` | first offered | the base shown on open |

**3D and relief.**

| Key | Default | Notes |
|---|---|---|
| `buildings3d` | `true` | extrude buildings at high zoom on vector basemaps (streets/light/dark) |
| `hillshade` | `false` | shaded-relief overlay (Esri raster, CSP-safe) |
| `terrainExaggeration` | `1.3` | vertical exaggeration when a DEM seam is wired |
| `terrainDemUrl` | unset | SEAM: raster-dem (terrarium) tile URL for real 3D terrain (see below) |

**Camera.**

| Key | Default | Notes |
|---|---|---|
| `maxPitch` | `72` | max tilt in degrees (0 keeps the map flat) |
| `initialPitch` | `0` | opening tilt |
| `initialBearing` | `0` | opening bearing |
| `doubleClickAction` | `"zoom"` | `"zoom"` (toward the cursor) or `"addPoint"` |

**Layers.**

| Key | Default | Notes |
|---|---|---|
| `clustering` | `true` | cluster nearby points |
| `clusterRadius` | `50` | px, 20..100 (also a runtime slider) |
| `clusterThreshold` | `25` | cluster only above this many located records |
| `heatmap` | `false` | show the heatmap layer by default |
| `heatmapWeightField` | unset | a number/currency field weighting the heatmap |
| `legend` | `true` | colour + size legend |

**Tools and controls.**

| Key | Default | Notes |
|---|---|---|
| `draw` | `true` | draw + measure (distance, area, radius) |
| `filterByArea` | `true` | a drawn shape filters the plotted records |
| `geocode` | `true` | address search + reverse "what's here?" |
| `route` | `true` | directions / itinerary |
| `routeProfile` | `"driving"` | default travel mode: `driving`, `walking`, `cycling` |
| `addPoint` | `true` | click (or double-click, or the context menu) to create a record at a location |
| `contextMenu` | `true` | right-click menu (directions, what's here, add, zoom) |
| `scaleControl` | `true` | scale bar |
| `geolocateControl` | `true` | locate-me control |
| `fullscreenControl` | `true` | fullscreen (desktop) |
| `minimap` | `false` | overview inset with a viewport rectangle |

### Seams (external services, wired without a key in the browser)

Two capabilities need an external service. Neither hardcodes a key or assumes a reachable host, so whatever a deployment's CSP allows, the flow stays wired end-to-end. Both live behind a config key and fall back to a labelled local mock offline / in CI.

- **Geocoding** (`geocodeEndpoint`). Address search and reverse geocode. Point it at an app route that proxies a keyed provider (Nominatim, Mapbox, Google, …) server-side: forward search takes `?q=`, reverse takes `?lat=&lon=`, and both return the shape in `geocode.ts`. Unset, a deterministic gazetteer mock runs, marking its results `approximate`. See `views/map/geocode.ts`.

- **Routing** (`routeEndpoint`, `osrmBaseUrl`). Turn-by-turn directions resolve in order: a custom `routeEndpoint` (an app proxy, `POST {waypoints, profile}`) → the public OSRM demo at `osrmBaseUrl` (default `https://router.project-osrm.org`, keyless, real road geometry and steps; if its host is outside the CSP the fetch fails and the flow falls back) → a local mock with synthesized steps, marked `approximate`. Set `osrmBaseUrl` to `""` to force the mock, or to a self-hosted OSRM to serve walking/cycling too. See `views/map/routing.ts`.

- **Real 3D terrain** (`terrainDemUrl`). The default relief is Esri's pre-rendered raster hillshade (CSP-safe, no DEM). For a true elevation mesh, set `terrainDemUrl` to a raster-dem (terrarium-encoded) tile template. This is off by default because its tile host must be on the deployment's CSP allow-list. See `views/map/camera.ts`.

Provider result shapes are the contract a real service drops into. The default (mock or public OSRM) keeps the whole map interactive with no configuration.
