# blocks/presentation — deck editor + share/track layer

> True at `feat/presentation` @ b569f70 (2026-07-22). NOT yet merged to main when written —
> if you are reading this on main, the merge happened; trust the code over any drift here.

## What this folder IS

A free-surface block: a slide-deck EDITOR (filmstrip · 16:9 canvas · layouts · rich text ·
free-placement elements · speaker notes · present mode · PPTX/PDF export · PPTX import) plus a
papermark-style SHARE layer (share links · read-only viewer · per-slide view analytics · data
rooms), persisting as ONE snapshot blob under a namespaced store key. Same host contract as
`blocks/workbook`: `value` + `onChange` + `reloadNonce`; the host owns persistence, this folder
owns everything inside. Wiring recipe: `docs/RECIPES.md` → "Presentation".

## FILE MAP

| File | One line |
|---|---|
| `types.ts` | The whole model: `DeckSnapshot`, `Slide`, `SlideElement`, `ElementStyle`, `DeckMaster`, `SlideTemplate`, share/analytics/room types, `PresentationConfig`. No logic. |
| `snapshot.ts` | Store key + `isDeckSnapshot` guard + `SEED_REV`/`isStaleSeed` (seed upgrade path) + `applyViewEvent` (pure analytics fold) + `seedDeck()` (the flagship demo AND journey fixture). |
| `elements.ts` | Pure functions over the free-placement layer: factories (`createShape/TextBox/ImageElement/Video/Chart/Table`), mutate/duplicate/z-order/group/align/distribute/snap/clamp. Array order IS z-order. |
| `PresentationSurface.tsx` | The editor shell: single header (menus, tabs, undo/redo), filmstrip, canvas, notes/master floating panels, history, keyboard, image/pptx file intents, template CRUD, tab panels. Default export for `React.lazy`. |
| `SlideView.tsx` | Renders ONE slide (regions by layout + master overlays + element slot). Also `sanitizeHtml`, `textOf`, `LAYOUTS` (layout → region spec). Used by canvas, filmstrip, present, viewer, export. |
| `ElementLayer.tsx` | The free-placement layer: render per element kind, drag/resize/rotate/marquee gestures, snapping guides, in-element text editing, anim attributes. |
| `ElementControls.tsx` | Insert menu (shapes grid, video URL form), the contextual element bar (style/text-depth/anim/z/align/group/chart-data/table ops), `ColorWell`, `FONT_STACKS`. |
| `chrome.tsx` | Thin adapters onto the app's own grammar: `PickerMenu`, `IconAction`, `TextAction`, `SectionTabs`. NO bare `<select>`, no hand-rolled popovers — this is why the surface audits clean. |
| `PresentMode.tsx` | Fullscreen presenting: keyboard nav, slide transitions, presenter strip (clock/notes/next), and `FitSlide` (the scaler every consumer shares). |
| `PresentationViewer.tsx` | The shared-link route: link resolution (missing/disabled/expired/email-gate), read-only playback, visible-time analytics emission. |
| `SharePanels.tsx` | Share tab (link CRUD), Analytics tab (per-slide bars + sessions), Rooms tab (data-room grouping). |
| `ShapeRender.tsx` | SVG shape rendering + `SHAPE_LABELS` + glyphs for the picker. |
| `ChartElement.tsx` | Recharts renderer for `chart` elements — LAZY chunk (~116 kB gz), loads only when a chart is on screen. |
| `TableElement.tsx` | Table rendering + pure row/col/cell mutators. |
| `export.ts` | PDF (print-window, zero bundle) + PPTX via pptxgenjs (LAZY chunk, on-click) incl. element-aware export + `htmlToRuns`. |
| `import.ts` | .pptx import (JSZip, lazy): shapes/text/images/notes/theme colors → slides on the `canvas` layout; unread constructs land in `warnings`. |
| `presentation.css` | All chrome (`--nx-*` tokens) + slide typography system (`--pres-*` vars) + present stage + animations + panels. |
| `index.ts` | The barrel: eager exports + `LazyPresentationSurface`. |

## THE MODEL

`DeckSnapshot` (types.ts) is the ONLY persisted object. It lives under
`presentationStoreKey(pageKey)` = `"presentation:<pageKey>"` in the host's app-state store.
Readers besides the editor: the host's share route (feeds `PresentationViewer`), and the
analytics fold (`applyViewEvent`) which the host may also run server-side (it is pure).

Two coexisting CONTENT PATHS on every slide — the most important thing to understand here:

1. **Layout REGIONS** (`slide.blocks`, keyed by `SlideBlocks`): the template path. `LAYOUTS`
   (SlideView.tsx) maps `slide.layout` → which regions render and with which CSS class. Region
   values are sanitized HTML strings (b/i/u/lists from `document.execCommand`).
2. **Free-placement ELEMENTS** (`slide.elements`): the PowerPoint path — text boxes, shapes,
   images, video, charts, tables at absolute coordinates, painted OVER the regions.
   **Array order IS z-order** (index 0 = back). Reordering is a splice (`reorder()` in
   elements.ts), never an index rewrite. `layout:"canvas"` = zero regions, elements only —
   **imported PPTX slides always land here**, because their content is already absolutely
   positioned; mapping foreign geometry into semantic regions would be guesswork.

**The 1280×720 design box** (`SLIDE_W/H` in elements.ts): every renderer — canvas, filmstrip
thumb, present stage, viewer, export — lays the slide out at exactly 1280×720 and scales the
whole box via `FitSlide` (transform scale inside a clipped wrapper). Element coordinates,
font sizes and region type ramps are absolute px IN THAT BOX; this single convention is why
all five consumers agree pixel-for-pixel. Never size slide content in viewport units.

**Master** (`deck.master`): deck-level defaults over the theme. Applied by `masterVars()` in
SlideView.tsx as SLIDE-SCOPED CSS custom properties — colors override `--pres-bg/fg/accent/
muted`, fonts set `--pres-font-h/--pres-font-b` (typography classes read them with `inherit`
fallback). Logo + footer render as absolutely-positioned overlays inside the slide box. Because
it is vars-on-the-slide-node, filmstrip/canvas/present/viewer agree automatically, and the PDF
export inherits it through the computed-style resolution in `doPdf`.

**Templates** (`deck.templates`): id-less saved slides; inserting clones under fresh ids
(`insertTemplate` in PresentationSurface.tsx). Per-deck only, by design (see LIMITS).

**Seed upgrade path** (`SEED_REV`/`isStaleSeed`, snapshot.ts): the host serves the STORED blob,
so a demo install would otherwise keep its first-ever seed forever. On adopt, an untouched
older seed (own `seedRev` older, or the legacy fixture signature: seed title + seeded slug,
no rev) is replaced by `seedDeck()` and the replacement is pushed up through `onChange`.
A user-authored deck is never touched. Bump `SEED_REV` whenever `seedDeck()` materially improves.

**History**: one deck-level undo/redo stack in PresentationSurface (drafts stream without
history; a gesture lands ONE commit; text commits coalesce by tag). Analytics folds are
deliberately NOT undoable.

## SEAMS (how to improve it — the named extension points)

| Seam | Where | What it takes |
|---|---|---|
| `PresentationConfig.buildShareUrl(slug)` | types.ts / SharePanels.tsx | HOST-OWNED: maps a share slug to the app's public viewer route. Default is a `#/share/<slug>` hash on the current page — fine for the harness, wrong for production. |
| `PresentationConfig.onAnalyticsEvent(ev)` | types.ts / PresentationSurface preview + viewer `onEvent` | HOST-OWNED: forward `ViewEvent`s to a backend. The in-snapshot fold (`applyViewEvent`) covers same-browser viewing only; TRUE cross-visitor analytics require this seam (the fold is pure and reusable server-side). |
| `PresentationConfig.features.*` | types.ts | Kill-switches per capability (share/analytics/rooms/exports/import/present). |
| `LAYOUTS` registry | SlideView.tsx | New slide layout = one entry (regions + classes) + CSS. See walkthrough below. |
| Element `kind` union | types.ts + ElementLayer + ElementControls + export.ts | New element type. See walkthrough below. |
| `PPTX_SHAPE` / `PPTX_CHART` maps | export.ts | Fidelity of PPTX round-trip per shape/chart kind. |
| Deck themes | presentation.css (`.nxPresTheme-*`) + `THEMES` in PresentationSurface | A theme = 4 CSS vars; `native` derives from `--nx-*` so it follows the app skin. |
| Present-stage skin | presentation.css (`--nx-pres-stage-*-override`) | The theatre-dark stage is re-pointable without touching the block. |
| `FONT_STACKS` | ElementControls.tsx | The font menu (element bar AND master panel read it). |

## HOW TO ADD X

**A new element type** (e.g. `embed`):
1. `types.ts` — extend `ElementKind`, add its payload field(s) on `SlideElement`.
2. `elements.ts` — `createEmbed(...)` factory with sane default geometry.
3. `ElementLayer.tsx` — a render branch in the element map (follow the `video` branch: inert
   while `editable`, live otherwise) + a case in `ariaFor`.
4. `ElementControls.tsx` — an Insert-menu entry (follow the video URL form if it needs input)
   and any bar controls; `labelOf` case.
5. `export.ts` — a branch in the element loop (poster/placeholder if not exportable — NEVER a
   silent drop) ; `import.ts` only if PPTX carries an equivalent.
6. Journey in `dev/journeys.mjs` asserting insert + persisted model + render.

**A new slide layout** (e.g. `three-column`):
1. `SlideView.tsx` — add to `LAYOUTS` with region keys (extend `SlideBlocks` in types.ts if a
   new key is needed) + class names.
2. `presentation.css` — `.nxPresLayout-three-column` grid + region typography. Reuse the
   heading-baseline system (`.nxPresH` + the 84px `padding-top` group) so rhythm stays uniform.
3. It appears automatically in the Slide menu, New-slide menu and layout picker (they iterate
   `LAYOUTS`). Add a `seedDeck()` slide if it should be demonstrated.

**A new chart type**: extend `ChartKind` (types.ts) → render case in `ChartElement.tsx` →
option list in `ElementControls.tsx` chart picker → `PPTX_CHART` mapping in export.ts.

## INVARIANTS AND TRAPS

- **`opacity` vs `fillOpacity`** (`ElementStyle`): `opacity` dims the WHOLE element (the wrapper
  div); `fillOpacity` dims a shape's FILL only, leaving its label readable — that is what
  PowerPoint's shape "Transparency" does. The element bar's slider maps to `fillOpacity` for
  shapes and `opacity` for everything else. Don't "simplify" them into one.
- **Array order is z-order.** Anything that reorders `slide.elements` changes stacking.
- **Uncontrolled contentEditable.** Regions and element text seed `innerHTML` once per value
  identity and report on input/blur. Making them controlled resets the caret every keystroke.
- **`sanitizeHtml` on BOTH ends** (write in editors, read in renderers) — shared-link viewers
  render author HTML; keep the allowlist scrubber in every new path that injects HTML.
- **Animations arm ONLY under `.nxPresAnimate`** (present stage + viewer wrap). The editor never
  has that class, so editing stays static; `data-anim` is set only when not `editable`.
  `prefers-reduced-motion` disables them — journeys therefore run with
  `reducedMotion:"no-preference"` (a reduced-motion browser hides this whole class of bugs).
- **Notes/master are FLOATING panels, never full-width bands** (user-arbitrated twice; guard
  journey `J2c-guard`). The surface has exactly ONE own header band at rest; text-format and
  element bars are contextual. Don't add a band.
- **Import parity is explicit**: `import.ts` reads text/shape geometry+fill/images/notes/theme
  colors; what it does NOT read (animations, masters, media, charts-as-charts…) surfaces in the
  returned `warnings` and is shown to the user in the import report — extend the parity, or
  extend the warning, never silently drop.
- **PPTX export mirrors that honesty**: unexportable content emits a labeled placeholder (see
  the `video` branch).
- **A seeded free-surface page shows STORED content.** The host serves the persisted snapshot,
  so shipping a better seed changes NOTHING for an existing install unless the seed is
  versioned and adopted (`SEED_REV`/`isStaleSeed` here). This trap is shaped into EVERY
  free-surface block in this repo (workbook, document, whiteboard…) — if you are building one
  and your demo content will ever improve, copy this mechanism on day one. It cost this block
  a full "nothing changed" rejection cycle before it was found.
- **`seedDeck()` is also the journey fixture.** Changing it means updating `dev/journeys.mjs`
  (index-sensitive tests create their own BLANK slide for gestures — keep that pattern) and
  bumping `SEED_REV`.
- **Heavy deps stay lazy**: pptxgenjs (export), JSZip (import), recharts (ChartElement) each
  live behind dynamic imports. A deck with none of those on screen pays for none of them —
  check the chunk table in a harness build before adding a dependency to the eager path.

## LIMITS (honest, at b569f70)

- **PPTX text export is Helvetica** — master/element font stacks don't map to PPTX runs yet.
  Fix path: translate `FONT_STACKS`/master fonts to `fontFace` per run in `export.ts`.
- **`lineHeight`/`letterSpacing` don't reach PPTX** (pptxgenjs `lineSpacing`/`charSpacing`
  exist — wire them in `htmlToRuns` option mapping).
- **Video**: URL-based only (mp4/webm/data). No YouTube/Vimeo oEmbed, no upload storage — a
  host data seam; data-URL uploads would bloat the snapshot blob. PPTX/PDF export the poster
  or a labeled placeholder.
- **Templates are per-deck.** A cross-deck library needs a host registry (the snapshot only
  owns its own deck).
- **Cross-visitor analytics need the host seam** (`onAnalyticsEvent` → backend). The local fold
  alone only sees same-browser sessions.
- **Legacy-seed replacement is signature-based**: a pre-`seedRev` DEMO deck that a user edited
  still matches (title+slug) and will be replaced on next open. Narrowing it means hashing
  seed content per rev.
- **Review/track-changes not built yet.** Planned: Suggesting mode capturing edits as
  `Suggestion` rows over region/element text, reviewed via record-core
  `useSuggestions` + `SuggestionPanel` (already on main) — adapt, don't rebuild.
- **No structural undo inside a contentEditable burst** beyond coalescing; caret-level history
  is the browser's.
