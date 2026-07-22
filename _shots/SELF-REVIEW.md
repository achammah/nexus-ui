# Reskin self-review — React Flow (xyflow) chrome → native app chrome

Branch `feat/reskin-flow` off `5c1c0c0`. Scope: the two stock xyflow chrome
components the flow-native pass left in place — the `<Controls>` cluster and the
`<MiniMap>` — plus a final sweep for any other stock signature (attribution,
background pattern). Both surfaces: the record flow VIEW (People) and the
standalone System Map PAGE (`#/p/systemmap`).

## Reference (the bar)

The app's own chrome, by name:
- **Toolbar cards** — `.nxFlowToolbar` / the top-left layout switcher + top-right
  action cluster of this same view: `--nx-bg-raised` card, `--nx-border`,
  `--nx-radius-m`, `--nx-shadow-1`, 26-30px icon buttons, `--nx-bg-sunken` hover.
- **Segmented controls** — `.nxSeg`/`.nxSegBtn` (record-core, calendar picker
  family): joined buttons, `--nx-accent-soft` + `--nx-accent` active state.
- **Icon language** — lucide STROKE icons (Crosshair, SquarePlus, Search, X are
  already on this canvas); never xyflow's filled glyphs.
- **Canvas well** — the flow canvas itself: `--nx-bg-sunken` inset surface.

## What changed

1. **Stock `<Controls>` → removed entirely.** Replaced by `FlowControls.tsx`
   (ours): one toolbar card holding zoom-out `−`, a **live zoom % readout**
   (tabular-nums, click = back to 100%), zoom-in `+`, fit-view, and a **layout
   lock** — lucide stroke icons, `.nxIconBtn` buttons, `--nx-*` card. Zoom state
   reads from the xyflow store so wheel/pinch zoom drives the readout too.
   Disabled states at min/max zoom. The lock pauses node-drag + edge-draw
   (pan/zoom/open stay live) and renders only when it governs something.
2. **MiniMap → a miniature canvas well.** Interior `--nx-bg-sunken` (the same
   surface the real canvas uses), out-of-view region veiled toward
   `--nx-bg-raised`, viewport window outlined `--nx-border-strong` at a
   constant hairline (`vector-effect: non-scaling-stroke` — the svg viewBox
   scales, a raw stroke vanishes or balloons with graph extent). Node dots keep
   per-record option colors (`--nx-opt-*`) with `--nx-border-strong` fallback.
   Frame: raised card border + radius + shadow (kept from the prior pass).
3. **Sweep:** attribution already hidden (proOptions + CSS belt-and-braces,
   xyflow is MIT — credit lives in NOTICE.md/PROVENANCE.md); background dot
   grid already token-mapped; edges/handles/selection/resizer already tokened
   by the flow-native pass — verified live rather than re-done.

All styling flows through `--nx-*` tokens (directly or via the `--xy-*` →
`--nx-*` mapping on `.nxFlowWrap`) — no hardcoded colors — so dark mode and
runtime skins re-derive by plain CSS inheritance. Verified LIVE: flipping
`data-theme` on the open page re-derives the zoombar card and the minimap mask
with no reload (see verification log below).

## Before / after

All in `_shots/` (committed on the branch — the /private/tmp worktree was
externally wiped once during this lane; the branch is the durable home):

| Surface | Before | After |
|---|---|---|
| Flow view, light | `flowview-light-before.png` (+`-controls`/`-minimap` crops) | `flowview-light-after.png` (+crops) |
| Flow view, dark | `flowview-dark-before.png` (+crops) | `flowview-dark-after.png` (+crops) |
| System Map, light | `sysmap-light-before.png` (+crops) | `sysmap-light-after.png` (+crops) |
| System Map, dark | `sysmap-dark-before.png` (+crops) | `sysmap-dark-after.png` (+crops) |
| System Map, mobile 390px | — | `sysmap-mobile-after.png` |

The controls crops are the story: stock filled `+ − ⛶` glyphs (instantly
"React Flow" to anyone who has used it) → the app's stroke-icon toolbar card
with a live `34%` readout — an affordance stock React Flow does not have, which
reads as designed-for-this-app, not embedded.

## Brutal test: would a cold user still recognize React Flow?

- **Controls:** no. The stock component is gone from the tree (verified: zero
  `.react-flow__controls` elements product-wide); nothing visual survives of it.
  A zoom cluster with a % readout is Figma/Miro language, not xyflow's.
- **MiniMap:** the *concept* minimap is generic (Figma/Miro/tldraw all have
  one); what was recognizable — the pale stock rectangle + violet-gray mask
  hugging the corner — is now the app's sunken well + veil + hairline window in
  app tokens. A cold user reads "this app has a minimap", not "that's React
  Flow's minimap".
- **Attribution:** none rendered.
- **Node cards / edges / dot grid:** already native (prior pass), re-verified.
- **Honest residue:** (a) `.react-flow__*` class names and `data-testid`
  hooks remain in the DOM — invisible without devtools, and journeys select on
  them; (b) the minimap node dots are plain rounded rects — generic, not a
  vendor signature; (c) an xyflow POWER user might recognize the interaction
  physics (zoom curve, selection box), which no reskin can or should change.
  Visually, on both surfaces and both themes, I found no remaining stock
  signature. The blind reviewer should hunt specifically for any I'm blind to.

## Functionality intact (17/17 interactive checks, own band :4640)

zoom-in/out drive canvas + readout · % resets to 100 · fit re-fits · lock
freezes node drag (aria-pressed, verified by a real drag attempt) · unlock
restores drag · minimap renders + drag-pans the canvas · journey-compat
`getByRole(/zoom in/i)` resolves · System Map carries the same chrome · zero
stock `.react-flow__controls` / attribution anywhere · LIVE theme flip
re-derives zoombar bg (rgb(255,255,255) → rgb(31,30,27)) + minimap mask.
Runtime skins ride the same mechanism (token override via CSS inheritance) —
the theme-flip check exercises exactly that path.

`tsc -b` clean · `vite build` clean (in the consuming starter, my UI synced).

Mobile 390px: zoombar fits (188×34 at x=13), no collisions; the record view
hides the minimap <760px (unchanged rule); the System Map page shows a small
one on mobile — the pages-primitive lane's own surface decision, wearing this
skin either way.

## DoD

- [x] Stock xyflow look of Controls + MiniMap killed on BOTH surfaces
- [x] All styling via `--nx-*` tokens / the `--xy-*`→`--nx-*` skin; re-derives
      live on theme flip (verified) and skins (same mechanism)
- [x] Zoom / fit / lock / minimap all work (17 interactive checks)
- [x] Light + dark coherent (shots, both surfaces)
- [x] BEFORE/AFTER shots incl. controls + minimap crops, committed
- [x] tsc + vite clean
- [x] Journey-compat: `flow-minimap` testid + `/zoom in/i` button name kept
- [ ] Native-not-widget CERTIFIED — not mine to claim: lead + blind reviewer

Known trade-offs, called out honestly:
- The lock is a NEW affordance (stock had `showInteractive={false}`, so no lock
  rendered before). The brief's bar listed lock as part of the cluster; it is
  small, controlled (`nodesDraggable`/`nodesConnectable` props), renders only
  when it governs something, and locks LAYOUT (drag/edge-draw), not navigation
  or opening records — app semantics, not widget semantics. Trivial to drop if
  the lead prefers strict parity.
- The zoom % readout is likewise additive — it is the strongest single
  "native product, not widget" tell, and stock React Flow has nothing like it.
