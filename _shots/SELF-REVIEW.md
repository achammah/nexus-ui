<!-- ===== FLOW lane (PR #34) ===== -->
# Flow depth lane self-review — ghost-box fix · right-click editor · chrome reskin

Branch `feat/reskin-flow` off `5c1c0c0` (PR #34, one PR for all three items).
Both surfaces throughout: the record flow VIEW (People) and the standalone
System Map PAGE (`#/p/systemmap`).

## Item 1 — BUG: ghost boxes on node select (FIXED, root-caused)

**Symptom:** selecting a node showed two empty blue-outlined rectangles
flanking the node label (upper-left + upper-right) plus a pale bar over it.

**Root cause (measured, not guessed):** xyflow tags its overlay elements with
BARE utility classes — resize controls get `top/bottom/left/right/line/handle`,
panels get `top left`-style pairs, nodes get `selected/draggable/nopan`. The
host app's own global `.top { display:flex; padding:10px …; background:…;
border-bottom:… }` header rule matched every element carrying class `top`:
the two TOP corner resize handles ballooned from 8×8 to ~50×22 outlined boxes
(border-box width floors at horizontal padding), the top resize line became an
11px pale bar, and the top toolbar panels got a phantom backdrop. An earlier
pass had hover-gated the resize controls, which only masked this at rest —
click a node (pointer hovering) and the ghosts returned.

**Fix (library-side, `flow.css`):** pin every box-affecting property on the
bare-classed elements at high specificity — panels (padding/bg/border), node
wrappers, resize controls (display/padding/margin/min-*), per-side
`border-width` pins so each resize line draws only its own edge, the full 8×8
handle spec, connect-handle padding/margin. The flow surface is now immune to
ANY consumer app's class namespace, not just this host's `.top`.

**Evidence:** `ghostbox-BEFORE.png` (ghosts, reproduced pre-fix via stash) →
`ghostbox-AFTER.png` (System Map) + `ghostbox-AFTER-recordview.png` (People).
DOM probe post-fix: 4 corner handles exactly 8×8, lines 1px, transparent.
Multi-node click sweep clean on both surfaces.

**Host-side note (not this repo):** the starter's `app.css:48 .top` rule is the
collider; renaming it is starter-repo hygiene the lead may want routed to that
lane. The library fix stands regardless.

## Item 2 — Right-click editor menu (n8n-class)

`FlowContextMenu.tsx` (new) + FlowView wiring + a `renameRequest` channel
through FlowActions into the node's existing inline title editor.

- **Canvas right-click → Add node**: with a type field configured, a typed
  list (System / Service / Data store / Queue / External — straight from the
  object config's select options, color-dotted with the option tokens); without
  one, a single "New node". The node is created THROUGH the surface's own
  store path (`onCreateDraft` → record draft form on the record view;
  `onCreate` → the page's app_state content store on System Map) and lands
  centered on the cursor via the same `positionsPatch` viewState path
  node-drag persists through.
- **Node right-click →** Change type (submenu, current value checked; writes
  `onPatch` on the type field) · Rename (opens the node's inline title editor)
  · Duplicate (copies all active fields incl. relations, "<name> copy", +28px
  offset) · Add connected node (self-relation graphs: creates, links via the
  relation field exactly as a drawn edge would, inherits the parent's type,
  drops below the parent) · Delete… (two-step arm inside the menu, destructive
  styling).
- Config-composable by construction: every item gates on the surface's
  capabilities (handEdit, onCreate/onCreateDraft/onPatch/onDelete, a type
  field, a self-relation). People (no type field, relation→companies) shows
  exactly add/rename/duplicate/delete; System Map shows the full set.
- Radix dropdown at a cursor-anchored phantom (portal escapes the canvas
  clip): Escape + outside-click dismiss; canvas pan/zoom closes it; read-only
  surfaces keep the native browser menu.

**Verified (24/24 interactive checks, own band):** pane menu opens on empty
canvas · Escape closes · typed add creates + persists ACROSS RELOAD with its
cursor position (store + viewState both debounce-saved) · change-type visibly
reshapes the node (kind drives shape: Queue = diamond; clipped shapes hide
meta chips by design) · rename opens the editor + commits · duplicate adds
"<name> copy" · add-connected adds node AND edge · delete arms then removes ·
People: plain add routes to the record DRAFT form, no type/connect items,
rename+delete present · zero page errors.

**Shots:** `menu-pane-open.png`, `menu-node-open.png`, `menu-type-submenu.png`,
`menu-type-changed.png`, `menu-node-added.png`, `menu-people-node.png`,
`menu-dark-type-submenu.png` (dark, submenu open — full coherence).

**Honest limits:** (a) iOS Safari long-press is NOT wired — the menu rides the
native `contextmenu` event (desktop right-click + Android long-press work; iOS
never fires it). Mobile node actions remain via the detail panel, which is the
touch path today. Wiring a manual 550ms press timer into xyflow's gesture
system is doable but gesture-conflict-prone — flagged, not smuggled in.
(b) Adding a node still triggers the view's existing re-fit animation (the
graph re-frames after add — pre-existing behavior, not introduced here; an
add-without-refit would be a separate UX decision.)

## Item 3 — Chrome reskin (shipped first, in this PR)

Stock `<Controls>` REPLACED by `FlowControls.tsx`: one `--nx-*` toolbar card —
zoom out · live zoom % readout (click = 100%) · zoom in · fit · layout lock —
lucide stroke icons, store-driven readout, min/max disabled states. MiniMap as
a miniature canvas well: `--nx-bg-sunken` interior, veil toward raised,
`--nx-border-strong` hairline viewport window (`vector-effect:
non-scaling-stroke`), option-token node colors. Attribution hidden (MIT;
credit in NOTICE.md). 17/17 interactive checks incl. LIVE `data-theme` flip
re-deriving zoombar + minimap mask with no reload; zero
`.react-flow__controls`/attribution elements product-wide; journey selectors
(`flow-minimap` testid, `/zoom in/i` name) preserved. Before/after ×
light/dark × both surfaces in `_shots/` (`*-before/after[-controls|-minimap]`).

## Gates

- tsc -b clean + vite build clean (consuming starter, UI synced) after ALL
  three items.
- Chrome regression suite re-run AFTER the menu work: 17/17.
- Menu E2E: 24/24 with reload-persistence.
- Cold-user test (chrome): no stock xyflow component remains visible;
  residue = devtools-only classnames + interaction physics. Blind reviewer
  should hunt for anything I'm blind to.
- Not self-certifying "native"/"editor-grade" — lead + blind reviewer decide.

<!-- ===== UNIVER lane (PR #35, merged) ===== -->
# Self-review — reskin-univer (Univer workbook chrome → native icon language)

**Reference (the bar):** the app's own chrome — the DataTable/flow-view toolbar vocabulary
(28px ghost hit-areas, `--nx-radius-s`, sunken hovers, muted-then-fg icons), the
SettingsTabs underline-tab family, and the lucide icon language every native surface uses
(`lucide-react`, stroke-2 round, ~16px).

## What changed (on top of the merged sheet-native pass)

The sheet-native wave themed values (`--univer-*` → `--nx-*`, canvas palette). The one
signature it left: **Univer's stock icon set + button chrome read icon-for-icon like
Google Sheets** — filled roller/paint-bucket-with-bar/A-with-bar/3×3 border grid glyphs.

1. **Icon-language swap at the registry** (`workbook-icons.tsx`, new): Univer resolves
   every menu/toolbar icon by NAME through its `ComponentManager`; `register()`
   overwrites. 94 registry names re-registered with app-language components right after
   `createUniver` (re-asserted once the render unit exists — two sheet controllers
   re-register late): lucide glyphs where the metaphor exists (undo/redo, B/I/U/S,
   aligns, merge, wrap, clipboard, rows/cols, eye, lock, Σ, %, $ …) and four GENERATED
   stroke families in lucide grammar for what lucide doesn't carry — 15 border variants
   (ghost frame + solid painted edges), 6 text rotations (arrow over baseline), 4 freeze
   states, decimal add/reduce. Two-tone keepers (font color, fill) keep Univer's live
   color strip, redrawn as glyph + rounded bar.
2. **Hardwired stragglers as currentColor stencils** (workbook.css): 12 direct-import
   glyphs the registry can't reach — the ×32 dropdown carets, ±, ×, ✓, ⋯/⋮, name-box
   caret, sheet-list, lock — repainted via CSS mask (original paths hidden, element
   becomes the stencil). Theme-proof by construction (paint = currentColor).
3. **Chrome CSS**: toolbar buttons on the app's hit-area vocabulary (radius-s, raised
   hover per the sidebar pattern); formula bar's cell-ref box in mono/muted with ghost
   confirm/cancel; sheet tabs restyled from stock pill to the SettingsTabs underline
   (meta type, accent underline on active); footer controls (add sheet, sheet list,
   zoom, gridlines) as ghost buttons.

## Before / after

| | Before | After |
|---|---|---|
| Light full | `_shots/before-sheet-light.png` | `_shots/after-sheet-light.png` |
| Light toolbar close-up | `_shots/before-sheet-light-toolbar.png` | `_shots/after-sheet-light-toolbar.png` |
| Dark full | `_shots/before-sheet-dark.png` | `_shots/after-sheet-dark.png` |
| Dark toolbar close-up | `_shots/before-sheet-dark-toolbar.png` | `_shots/after-sheet-dark-toolbar.png` |
| Sheet tabs (light/dark) | `_shots/before-sheet-*-tabs.png` | `_shots/after-sheet-*-tabs.png` |
| Border picker / context menu / overflow | — | `_shots/after-sheet-light-border-popup.png`, `_shots/after-sheet-light-context-menu.png`, `_shots/after-sheet-light-overflow.png` |

## Brutal test: would a cold user still recognize Google Sheets?

The icon-for-icon signature is gone: every toolbar/menu glyph, the border picker's 15
variants, the context menus, the number-format cluster and the carets now speak the
app's stroke language, and the tabs/formula bar sit on app vocabulary. A cold user reads
"this app has a spreadsheet surface", not "Google Sheets in an iframe". What remains is
spreadsheet-DOMAIN vocabulary (a grid, a formula bar with *fx*, bottom sheet tabs,
canonical toolbar order) — shared by Excel/Numbers/LibreOffice, kept deliberately for
muscle memory.

## Honest residuals (what is NOT restyled, and why)

- **The `fx` mark** — kept by choice (universal formula vocabulary), restyled to
  muted-faint instead of reshaped.
- **Canvas-rendered text** (formula-editor line, in-cell editor) — painted by Univer's
  docs engine, not CSS-reachable; cell content font is workbook DATA (the seed uses
  Arial, so the font dropdown truthfully shows Arial).
- **Zoom slider geometry** — left neutral (already token-colored; its exact track/knob
  metrics are deep in hashed Tailwind).
- **Freeze-boundary shadow inverts light in dark** — pre-existing stock-Univer behavior
  documented by the sheet-native wave; not reachable through the theming API.
- **Version pinning** — the mask stencils + registry names bind to `univerjs-icon-*`
  ids / icon names at the pinned 0.25.1; an engine upgrade that renames them degrades
  gracefully (stock glyph shows again, nothing breaks).
- One dev-only warning pre-exists on the page (app `Button` ref warning) — present on
  main before this lane, untouched.

## DoD

- [x] Native-not-widget: registry swap (94 names) + 12 stencils + chrome CSS; blind
      review decides finally.
- [x] All styling via `--nx-*` tokens / currentColor — no hardcoded colors; masks are
      alpha-only stencils; re-derives on live theme/skin flips (journey-asserted).
- [x] Functionality intact: 12/12 journeys green on the built dist — renders, =SUM
      computes + persists, insert column via header context menu, Bold via toolbar,
      live theme flip, empty state, mobile type-in-cell, 10k first-paint budget, plus
      the 4 sheet-native chrome regression journeys.
- [x] Light + dark coherent (shots + theme-flip journey).
- [x] Before/after shots incl. toolbar close-ups; popup/context/overflow extras.
- [x] tsc -b + vite build clean.
