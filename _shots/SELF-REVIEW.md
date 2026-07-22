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
