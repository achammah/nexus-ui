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
