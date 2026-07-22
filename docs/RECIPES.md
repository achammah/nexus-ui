# RECIPES — wiring blocks into an app

Append-only: each block adds its own `##` section. Never truncate or rewrite another block's section.

## Presentation (deck editor + share/track)

A free-surface block (`src/blocks/presentation/`): a slide deck editor (filmstrip, 16:9 canvas, 7 layouts, rich text, images, speaker notes, transitions, themes, present mode, PDF/PPTX export) plus a papermark-style layer (share links, read-only viewer, per-slide view analytics, data rooms). Persists as ONE snapshot blob.

### Page wiring (same contract as the workbook block)

```tsx
import {
  LazyPresentationSurface,      // or PresentationSurface (eager; it is light — pptxgenjs lazy-loads itself)
  presentationStoreKey,
  isDeckSnapshot,
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
- **PPTX** — `exportDeckToPptx(deck)`: `import("pptxgenjs")` on demand (MIT, own chunk ≈ 400 kB gz; never in the eager bundle). Text degrades to paragraphs/bullets with bold/italic runs; images embed; speaker notes carry over.

### Keyboard

Editor (outside text): ↑/↓ select slide, ⌘D duplicate, Delete remove, ⌘Enter present.
Present: ←/→/Space/PageUp/PageDown navigate, Home/End jump, P presenter notes, Esc exit.
Viewer: ←/→/Space navigate.
