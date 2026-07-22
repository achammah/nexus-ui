# Presentation block (deck editor + papermark layer) — self-review

**Reference products (the bar):** Google Slides / Pitch / bolt-slides for the editor; Papermark/DocSend for share + tracking.
**Verification:** isolated chromium, `reducedMotion: "no-preference"` (real motion — J6b asserts a RUNNING animation on slide entry), 42/42 journeys green (`dev/journeys.mjs`, local harness — not committed). tsc `--noEmit` clean for the block; `vite build` clean.

## Per-feature verdicts (each backed by a journey + shot)

| Feature | Verdict | Evidence |
|---|---|---|
| Filmstrip + 16:9 canvas, 10-slide seeded deck (real QBR content, no lorem) | works | J1, `pres-editor-light.png` |
| Rich text (B/I/U + lists, correct toggle semantics), typing, persistence | works | J2a-b |
| Speaker notes (editor drawer + presenter view) | works | J2c, J6c |
| Add (7 layouts) / duplicate (⌘D) / delete / move / drag-reorder | works | J3a-e |
| Layout + transition switch per slide | works | J4 |
| Image slide: seeded SVG chart, file upload → data URL, replace | works | J5, `pres-editor-light.png` slide 5 |
| Present mode: fullscreen, arrows/Space/Home/End/Esc, click-advance, real CSS transitions (fade/slide/zoom, reduced-motion respected) | works | J6a-d, `pres-present-presenter.png` |
| Presenter view (P): clock, notes, next-slide | works | J6c |
| 5 deck themes (native token-driven + paper/midnight/accent/gradient) | works | J7, `pres-theme-*.png` |
| Light + dark (all chrome `--nx-*`; native theme follows tokens) | works | J8, `pres-editor-dark.png` |
| PDF export (browser print window, one 16:9 page per slide, zero bundle) | works | J14 (10/10 pages) — headless can't exercise the OS print dialog itself |
| PPTX export (pptxgenjs MIT, lazy chunk) | works | J13: real 108 kB .pptx downloaded; chunk 126 kB gz loads on click only |
| Share links: create, label, email gate, expiry, enable/disable, copy, preview | works | J9, `pres-share-panel.png` |
| Viewer: link resolution, expired/disabled refusal, email gate, dot nav | works | J10a, `pres-viewer-gate.png`, `pres-viewer-player.png` |
| Per-slide view analytics (visible-time only, completion, reach) | works | J10b-d: real session folded into the snapshot with measured ms |
| Analytics panel (time bars, reach, session list) | works | J11, `pres-analytics.png` |
| Data rooms (group this deck + host-resolved refs) | works | J12, `pres-rooms.png` |
| Mobile 390px (horizontal filmstrip rail, 16:9 boxes measured, no h-scroll) | works | J15, `pres-mobile-*.png` |
| Undo / redo (document history, coalescing; ⌘Z / ⌘⇧Z / ⌘Y + toolbar) | works | J17a-g, `pres-undo-toolbar.png` — delete-slide and delete-link both restore by id |
| a11y: roles (listbox/option, tablist, toolbar, textbox regions), labels, focus-visible ring, keyboard end-to-end | works | J16 + keyboard journeys |

## Honest gaps / seams / mocks

1. **Analytics persistence seam (labeled, not silently faked).** Events fold into the snapshot via `applyViewEvent` — real and live in the editor's viewer preview and same-browser viewing. A TRUE external viewer (other person, other browser) needs the host to route the documented `ViewEvent` payload to a backend (`PresentationConfig.onAnalyticsEvent` / viewer `onEvent`). Documented in docs/RECIPES.md. The seeded sessions are demo data (labeled by their fixture emails).
2. **Share URL seam.** Default `#/share/<slug>` targets the current page; real deployments set `buildShareUrl`. Documented.
3. **Data-room cross-page items** are title+href references — the cross-page registry is the host's; only "this deck" is first-class inside one snapshot. Stated in the panel's own hint text.
4. **Rich text is deliberately small**: B/I/U/lists via `document.execCommand` (deprecated-but-universal). No font pickers, colors, or arbitrary text boxes — layouts carry the design. PPTX flattens inline runs per `<li>`.
5. **PPTX fidelity**: text/images/notes carry over on a 13.33x7.5" layout; theme backgrounds/accent bars do not (documented in RECIPES).
6. **PDF export needs popups allowed**; throws a clear error otherwise.
7. **Undo granularity.** The document history covers structural ops and coalesces continuous edits (700ms window, depth 60); caret-level text history inside a focused region is still the browser's native contentEditable undo, so ⌘Z behaves slightly differently in-region vs out. Documented in RECIPES.
8. **Presenter view** is a side panel in the same window, not a second-window presenter display.

## "Does this still feel like a toy?" (brutal pass)

- The seeded deck reads like a real board deck, every layout is exercised by it, and the editor loop (select → type → bold → reorder → present) feels direct; the papermark layer has the DocSend core loop (link → gate → per-slide time → completion) actually measured, not stubbed.
- Where it would betray itself vs Pitch: no text boxes/free placement, no image cropping, transitions are entry-only. I judge it "credible v1 product surface, not a toy" — but per the brief, that verdict belongs to the lead + blind reviewer, not me.

## Not fixed / pre-existing

- `tsc` on this branch errors on `src/blocks/workbook/*` (`@univerjs/*` not in package.json) — pre-existing on main, untouched here.

## Build-pass addenda (Opus pass)

- **Present-mode chrome is now token-routed.** The stage stays theatre-dark in both app themes by
  design (Slides/Pitch do the same), but every stage surface reads
  `--nx-pres-stage-*-override` instead of a baked hex, so a host can re-skin it. Previously the only
  chrome in the block that a consumer could not re-point.
- **`isPresentationSnapshot`** exported as an alias of `isDeckSnapshot`, matching `isWorkbookSnapshot`
  so host wiring reads the same across blocks.
- **Undo/redo added** — see the row above. This closed the one true data-loss path (delete slide /
  delete share link had no way back).
- **Measured bundle:** eager harness bundle 182.4 kB raw / 59.3 kB gz; pptxgenjs isolated in its own
  on-click chunk at 372.5 kB raw / 126.3 kB gz. RECIPES previously misstated the chunk as "≈400 kB gz";
  corrected.
- Verified this pass by me, not inherited: tsc clean (block), harness build clean, 42/42 journeys run
  live, shots re-captured.
