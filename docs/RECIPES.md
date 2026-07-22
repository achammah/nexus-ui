# RECIPES — wiring blocks into an app

Append-only: each block adds its own `##` section. Never truncate or rewrite another block's section.

## Presentation (deck editor + share/track)

A free-surface block (`src/blocks/presentation/`): a slide deck editor (filmstrip, 16:9 canvas, 7 layouts, rich text, images, speaker notes, transitions, themes, present mode, PDF/PPTX export) plus a papermark-style layer (share links, read-only viewer, per-slide view analytics, data rooms). Persists as ONE snapshot blob.

### Page wiring (same contract as the workbook block)

```tsx
import {
  LazyPresentationSurface,      // or PresentationSurface (eager; it is light — pptxgenjs lazy-loads itself)
  presentationStoreKey,
  isDeckSnapshot,               // also exported as isPresentationSnapshot
  seedDeck,
  type DeckSnapshot,
} from "@nexus/ui";

const key = presentationStoreKey(pageKey);           // "presentation:<pageKey>"
const stored = store.get(key);
const value: DeckSnapshot | null = isDeckSnapshot(stored) ? stored : null; // surface seeds when null

<React.Suspense fallback={null}>
  <LazyPresentationSurface
    value={value}
    onChange={(snapshot) => store.set(key, snapshot)} // host debounces
    reloadNonce={reloadNonce}
    actions={<SaveChip/>}
    config={presentationConfig}
  />
</React.Suspense>
```

`value` shape — `DeckSnapshot` (`src/blocks/presentation/types.ts`):

```ts
{
  kind: "deck", version: 1, id, title,
  theme: "native" | "paper" | "midnight" | "accent" | "gradient",
  slides: Array<{ id, layout, blocks: { title?, subtitle?, body?, left?, right?, imageUrl?, caption?, quote?, attribution? }, notes, transition? }>,
  sharing:   { links: ShareLink[] },      // slug, label, createdAt, expiresAt?, emailGate?, disabled?
  analytics: { sessions: ViewSession[] }, // linkId, viewerEmail?, startedAt, slideMs{slideId->ms}, maxSlideIndex, completed
  rooms: DataRoom[]                       // grouping of this deck + host-resolved refs to other decks/docs
}
```

Rich-text block values are sanitized HTML strings (b/i/u + lists). Layouts: `title`, `title-body`, `two-column`, `image`, `quote`, `section`, `blank`.

### PresentationConfig (all optional)

| Key | Default | Meaning |
|---|---|---|
| `defaultTheme` | `"native"` | theme for new decks |
| `features.share` | `true` | Share tab (link CRUD) |
| `features.analytics` | `true` | Analytics tab |
| `features.rooms` | `true` | Data-rooms tab |
| `features.pdfExport` | `true` | PDF button (browser print path, zero bundle) |
| `features.pptxExport` | `true` | PPTX button (pptxgenjs, LAZY chunk — loads on first click) |
| `features.present` | `true` | Present button / fullscreen mode |
| `buildShareUrl(slug)` | `origin+path#/share/<slug>` | **CONFIG SEAM** — map a share slug to the app's public viewer route |
| `onAnalyticsEvent(ev)` | — | **CONFIG SEAM** — forward viewer events to a backend as well |

### Viewer route (the shared link target)

The host owns routing. On its share route, render:

```tsx
<PresentationViewer
  deck={deck}                       // load by slug -> find the page whose snapshot has sharing.links[].slug
  slug={slugFromUrl}
  onEvent={(ev) => store.set(key, applyViewEvent(deck, ev))}  // pure fold; and/or POST to a backend
/>
```

The viewer enforces link state itself (missing / disabled / expired / email gate) and emits
`session_start` / `slide_time` (visible-time only) / `session_complete` events.

**Analytics persistence seam (honest limits):** with only the local snapshot store, events fold into
the snapshot **in the same browser profile** — a true external viewer needs the host to POST events
(`onAnalyticsEvent` / the viewer's `onEvent`) to a backend and fold them server-side. Payload shape is
`ViewEvent` in `types.ts`; the fold is `applyViewEvent` (pure, reusable server-side).

### Exports

- **PDF** — `exportDeckToPdf(deck, themeCss)`: opens a print window (16:9 landscape pages) and triggers the OS print dialog ("Save as PDF"). Zero bundle cost. Requires popups allowed.
- **PPTX** — `exportDeckToPptx(deck)`: `import("pptxgenjs")` on demand (MIT, own chunk — measured 372 kB raw / 126 kB gz; never in the eager bundle). Text degrades to paragraphs/bullets with bold/italic runs; images embed; speaker notes carry over.

### Theming

All editor/viewer chrome rides `--nx-*` tokens, so the block follows the app skin and the light/dark
flip with no per-block config. Deck THEMES are content palettes: each sets `--pres-bg` / `--pres-fg` /
`--pres-accent` / `--pres-muted`, which every slide region reads — `native` derives them from `--nx-*`
(so the deck itself re-skins with the app), the others are fixed designer palettes.

Present mode is deliberately theatre-dark in both app themes (the room is dark, the slide is the light
source — as Slides/Pitch do). It is still re-skinnable: override any of
`--nx-pres-stage-{bg,panel,fg,muted,line,btn-line,btn-fg,btn-hover}-override` on an ancestor to
re-point the stage (e.g. onto `--nx-*` tokens for a light-stage kiosk).

### History (undo/redo)

ONE history for the whole deck. Structural ops (add / duplicate / delete / reorder / layout /
transition, and share-link + data-room changes) each land as a step; continuous edits coalesce, so ⌘Z
undoes a typing burst rather than a keystroke. Native contentEditable undo still owns caret-level
history inside a focused text region — this stack exists to catch the destructive ops (delete slide,
delete link) that otherwise had no undo path. Depth 60; a `reloadNonce` bump clears it (new document).
Viewer analytics folds are deliberately NOT undoable — they are recorded facts, not edits.

### Keyboard

Editor (outside text): ↑/↓ select slide, ⌘D duplicate, Delete remove, ⌘Enter present, ⌘Z / ⌘⇧Z (or ⌘Y) undo/redo.
Present: ←/→/Space/PageUp/PageDown navigate, Home/End jump, P presenter notes, Esc exit.
Viewer: ←/→/Space navigate.

### PPT-parity layer (masters · templates · text depth · animation · video)

- **Deck master** (`DeckSnapshot.master`): deck-level defaults over the theme — heading/body font
  stacks, palette overrides (`bg/fg/accent/muted`), a logo stamped on every slide (`pos: tl|tr|bl|br`,
  `size` design-px), and a footer line with optional slide numbers. Edited in-surface (Slide →
  "Deck master…"); applied as slide-scoped CSS vars (`--pres-font-h/--pres-font-b` + `--pres-*`
  color overrides), so filmstrip, canvas, present, viewer and PDF all agree.
- **Slide templates** (`DeckSnapshot.templates`): Slide → "Save as template" stores the current
  slide (id-less); the New-slide menu grows a "Your templates" section; inserting clones under
  fresh ids. A lightweight slide library per deck — not a cross-deck store (that would be a host
  registry seam).
- **Text depth** (element level): `ElementStyle` adds `lineHeight` (multiplier) and
  `letterSpacing` (px) on top of `fontSize/fontFamily/align/valign/color`; the element bar exposes
  font (Theme/Sans/Serif/Mono/Display), horizontal + vertical alignment, and line height.
- **Entrance animation**: `SlideElement.anim = { effect: "fade"|"rise"|"pop"|"wipe" }` — plays in
  PRESENT mode and the shared viewer only (editor stays static), staggered in element order,
  disabled under `prefers-reduced-motion`. Slide-level transitions are unchanged.
- **Video elements**: Insert → video URL (mp4/webm, or a data URL). Inert while editing
  (drag/resize like any element), real `<video controls>` in present/viewer. PPTX export flattens a
  video to its poster/placeholder (pptxgenjs media embedding is not wired); PDF prints the poster
  frame — both noted honestly rather than silently dropped.
