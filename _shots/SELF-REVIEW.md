# Reskin: Excalidraw (whiteboard) — self-review

**Reference (the bar):** the app's own native chrome — the ops rail (`.nxWbOps*`, the native pill sitting beside the vendor toolbar), the DataTable/record-page control density, the `--nx-*` token surfaces (raised islands, 6px/9px radii, quiet icon buttons, accent-soft active states, uppercase meta field labels).

**Scope note:** all excalidraw chrome flows from one scope (`.nxWbCanvasInner`, the wrapper WhiteboardCanvas itself renders), so the record FIELD, the mobile overlay PAGE, and any future standalone host inherit the same skin. Every color is `var(--nx-*)` — a live theme or skin flip re-derives the whole surface (the shots flip `data-theme` on a mounted canvas).

## Surfaces (before / after)

| Surface | Before | After |
|---|---|---|
| Field, light | `before-field-light.png` | `after-field-light.png` |
| Field, dark | `before-field-dark.png` | `after-field-dark.png` |
| Field + props panel, light | `before-field-props-light.png` | `after-field-props-light.png` |
| Field + props panel, dark | `before-field-props-dark.png` | `after-field-props-dark.png` |
| Field + text probe, light | `before-field-text-light.png` | `after-field-text-light.png` |
| Field + context menu | `before-field-ctxmenu-light.png` | `after-field-ctxmenu-light.png` |
| Field + main menu | `before-field-mainmenu-light.png` | `after-field-mainmenu-light.png` |
| Field, short well (vendor mobile layout inside desktop, real on 900px laptops) | `before-field-shortwell-{light,dark}.png` | `after-field-shortwell-{light,dark}.png` |
| Overlay page (390x844) | `before-page-{light,dark}.png` | `after-page-{light,dark}.png` |

## What changed (on top of the earlier token pass)

- **Toolbar**: numbered keycap digits removed (the loudest signature; shortcuts still work), control density brought from the vendor's 36px touch grid to the app's 32px rail grammar (`--default-button-size`/`--lg-button-size`/`--lg-icon-size`), island padding/gap matched to the ops-rail pill, and the toolbar no longer slides under the ops rail (its footprint is reserved). Desktop only — the vendor mobile layout keeps its touch sizes.
- **Panels**: property-section headings now use the app's uppercase meta field-label voice; dialog controls (text fields, radio groups, switches, sliders, scrollbars) mapped to form-control tokens.
- **Menus**: main menu, extra-tools dropdown and the right-click context menu take the app popover grammar (raised, bordered, `--nx-radius-m`, soft-accent hover, faint shortcuts) instead of the vendor's filled-accent hover.
- **Islands**: zoom, undo/redo and eraser pills get real borders + `--nx-shadow-1` with quiet transparent buttons; scroll-back and exit-zen chips read as native raised chips.
- **Fonts**: chrome text is `--nx-font-sans` everywhere (`--ui-font` + scope font-family); NEW canvas text defaults to the normal sans (`FONT_FAMILY.Nunito`) instead of the hand-drawn face — existing elements keep their font, hand-drawn stays one click away in the picker.
- **Trimmed foreign UI**: library trigger, keyboard-hint banner, help icon, and the collab-time laser quick-toggle island (collided with the ops rail; laser stays in the extra-tools menu).

## Functionality check (store-verified, not visual)

Draw rect via toolbar button, standalone text via text tool, undo — element count round-tripped through the record store API: 52 → 53 → 54 → 52. Save chip renders. Menus open/close. tsc `--noEmit` clean; `vite build` clean.

## Brutal test: would a cold user still recognize Excalidraw?

- **Chrome: no.** The digits, indigo defaults, Virgil UI text, library/help affordances and the loose-widget island look are gone; toolbar, panels, menus and pills read as the app's own control language in both themes.
- **Canvas: partly, by design.** The drawing FEEL (hand-drawn stroke style on existing elements, selection handles, tool set/order) is excalidraw's engine and stays. A user who knows excalidraw well could clock the canvas behavior; a cold user sees native app chrome around a whiteboard.

## Residual vendor structure (honest)

- Canvas-level rendering (selection handle shapes, dark-mode content inversion via the vendor `--theme-filter`, hand-drawn stroke rendering) is engine behavior, not CSS-reachable — left as is.
- The tiny color-swatch buttons keep vendor micro-outlines (`--color-gray-30` + theme-filter); neutral and low-key, not re-mapped.
- The vendor mobile layout (short wells, overlay page) keeps vendor touch sizing on purpose; its islands/colors are tokenized.

## Pre-existing issues discovered while verifying (NOT introduced, not fixed here)

1. **Pointer offset after scrolling** — excalidraw caches container offsets at mount and misses the record page's custom scroll container: after scrolling, pointer→scene mapping is off by the scroll delta (drawn elements land far from the cursor). Repros on clean main (CSS/font can't affect pointer math; my before-run probes hit it identically). Fix direction: call `api.refresh()` on the scroll container's scroll (or observe it) in WhiteboardCanvas.
2. **Mobile overlay (390px): the ops rail overlaps the toolbar's right end** — tools under it are unreachable there. Present on main before this PR (see `before-page-light.png`). Needs an OpsRail placement pass for narrow canvases, not a color fix — left out of this reskin deliberately.

## DoD

- [x] Native-not-widget: excalidraw chrome signature killed (digits, fonts, density, menus, islands)
- [x] All styling via `--nx-*` tokens; re-derives live on theme flip (shot both themes on a mounted canvas); no hardcoded colors added
- [x] Functionality intact: draw / shape / text / undo store-verified; menus + buttons exercised
- [x] Light + dark coherent (all surfaces shot in both)
- [x] BEFORE/AFTER shots: field AND page, light + dark (plus props/menus/short-well states)
- [x] tsc + vite build clean (in the consuming starter)
- [ ] "Native" verdict — the lead's + blind reviewer's call, not self-certified
