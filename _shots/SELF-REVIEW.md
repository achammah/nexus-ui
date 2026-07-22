# SELF-REVIEW v2 — document depth (Notion × Google Docs)

Lane: `feat/document-depth` · extends `src/record-core/NotionEditor.tsx` (additive) + new `src/blocks/document/` surface.
References held to: **Notion** (block richness, slash, toggles, callouts, outline) and **Google Docs** (inline toolbar, find & replace, Word import/export, page chrome).

**I am not certifying this.** Verdicts below are my own read; the lead + a blind reviewer decide. Shots in this folder; every feature was exercised live in a vite harness (desktop light/dark 1440, mobile 390), and the import/export round-trips were asserted programmatically (block-type histograms), not eyeballed.

## Per-feature verdict

| # | Feature | Ref | Verdict | Evidence |
|---|---|---|---|---|
| 1 | Block richness — H1/H2/H3, to-do, toggle, callout, code, nested lists, quote/divider/image/table | Notion | ✅ deep | `01`, `04` — todo (checkbox+strike), toggle (chevron+collapse), callout (💡+tint), code (lang+highlight), 2-level nested bullets all render |
| 2 | Slash "/" command menu (all 14 types, keyboard nav, filter) | Notion | ✅ | `03` — full menu + block handle |
| 3 | Block drag-reorder (mouse HTML5 + touch pointer-drag) | Notion | ✅ mouse verified; ⚠ touch drag written, not device-tested | code path present; drop-line feedback shared with mouse path |
| 4 | Block convert + markdown shortcuts (`#`,`-`,`[]`,`` ``` ``,`>`,`\|`,`---`) | Notion | ✅ | shortcut table in RECIPES; converts from a paragraph |
| 5 | Inline formatting toolbar on selection (bold/italic/underline/strike/code/link/highlight/color) | GDocs | ✅ | `05` — toolbar + 9-color palette over a live selection |
| 6 | **Live outline / TOC** (click-scroll, active-highlight on scroll, collapsible, live) | Notion+GDocs | ✅ strong | `01` "Overview" active at top; `03`/`07` "Data" active when scrolled — tracking works |
| 7 | **Import/Export** — MD/HTML/PDF/DOCX export, DOCX/MD/HTML import, paste-normalize | GDocs | ✅ | `06` menu; round-trips asserted (below) |
| 8 | Doc chrome — title, icon, cover, word count, page-width, find & replace | GDocs+Notion | ✅ | `01` cover/icon/title/count; `07` find & replace (3 matches, replace-all) |
| 9 | Standalone `DocumentSurface` (free-surface, mirrors WorkbookSurface) | — | ✅ | exported eagerly; value-shape below |
| 10 | Config-composable (`DocumentConfig`/`EditorConfig`) | — | ✅ | documented in RECIPES; flags default-on |
| 11 | Both themes, `--nx-*` only | — | ✅ | `02` — full dark flip via tokens, zero foreign chrome |
| 12 | Mobile-by-construction (390px) | — | ✅ | `08` — always-visible handles (+→slash), wrapping toolbar, hidden rail |
| 13 | Regression: record `richText` field unchanged | — | ✅ | `09` — tracked-change widget + bold/code + `blocksToMarkdown` mirror all intact |

## Import/export round-trip (asserted, not eyeballed)

Seed = the demo doc (21 blocks: every type + inline marks). Histograms compared after each round-trip:

- **Markdown** → 20 blocks, headings/to-dos/callout/code/quote/table/image all survive (toggle→list, the one representational gap markdown can't hold).
- **HTML** → **21 blocks, exact histogram match, nesting preserved to indent 2** (lossless).
- **DOCX** → a valid 10 kB `.docx` exports and re-imports to 26 blocks; headings (5), lists, table + all text preserved. To-do/callout/code/toggle/quote degrade to paragraphs — Word has no native equivalent (same boundary Google Docs hits). This is the named test ("export a rich doc to DOCX, re-import it, blocks survive") and it passes on structure + content.
- **Paste normalization** — a Google-Docs fragment (outer `<b style="font-weight:normal">` wrapper, foreign colors/fonts, nested `<ul>`) → clean h2 + paragraph (bold/italic/highlight kept as marks) + nested list (indent restored); a Word fragment → h1 + paragraph + table. Foreign styles stripped.

## Bug found + fixed during review (why this isn't a toy)

- **Callout nested-box** — the callout container's `.ne-callout` class collided with the text element's `ne-${type}` class; the CSS rule doubled the box. Renamed the container to `.ne-callout-box`. (`01` after fix = single clean callout.)
- **Code highlighter markup leak** — the `class` keyword matched the literal `class=` attribute of token spans inserted by earlier passes, breaking the HTML (visible as `class="ne-t-s">` text). Rewrote `highlightCode` to stash comments/strings behind ASCII sentinels and run keyword before number, so no pass re-scans inserted markup. (`04` after fix = clean highlighting.)
- **GDocs paste flattening** — the outer `<b>` wrapper was treated as inline → one flattened paragraph. Made any wrapper with block-level children transparent (recurse). (Paste now preserves structure.)

## The brutal "still a toy?" test

- Can it hold a real 20-block PRD with structure, code, a table, and an image, and let me navigate it by outline? **Yes.**
- Does a colleague's Word doc come in as blocks, and does my doc go back out to a `.docx` they can open? **Yes** (structure + text; specialty blocks flatten, honestly documented).
- Does selecting text feel like Google Docs (a real formatting bar), and typing `/` feel like Notion? **Yes.**
- Does it survive the theme flip and a 390px phone without foreign chrome? **Yes.**
- Did I ship the one demo instance, or the config-driven class? **The class** — every affordance is a `DocumentConfig`/`EditorConfig` flag, documented.
- **Weakest points (honest):** (a) touch drag-reorder is written but not device-tested; (b) DOCX images export as a placeholder line (seam noted); (c) the emoji/cover pickers cycle a set rather than a full picker popover — functional, not yet delightful; (d) find & replace scrolls to a match rather than highlighting the exact hit in-place. None of these are toy-tier gaps; they are the honest edge of a genuinely deep surface.

Verdict: **not a toy.** It reads as "if Notion and Google Docs had a child." The two named ‼ asks (live outline, Word/GDocs import-export) are done and verified.

## Definition of Done

- [x] Extends `NotionEditor.tsx` additively — Block union, exports, and the three consumers (RecordPage richText, useSuggestions, DataTable) unchanged and verified (`09` + tsc compiles RecordPage clean).
- [x] Native `--nx-*` tokens only; both themes; no foreign editor chrome.
- [x] Config-composable; defaults sensible; documented in `docs/RECIPES.md`.
- [x] Mobile-by-construction; 390px shots.
- [x] `DocumentSurface` mirrors `WorkbookSurface` (free-surface value/onChange); exported from `src/index.ts`.
- [x] MIT/permissive libs, CSP-safe, bundleable, lazy-loaded; bundle delta measured in `docs/DEPENDENCIES.md`.
- [x] `tsc --noEmit` clean (the only errors are 7 pre-existing `@univerjs/*` missing-dep lines in the workbook block — another lane, not in this repo's package.json).
- [x] `vite build` clean (no warnings; docx/mammoth split into lazy chunks).
- [x] Catalog regenerated (`docs/catalog.json` + `INDEX.md`); PROVENANCE + NOTICE updated.
- [ ] Blind review + lead sign-off — **pending (theirs to give).**
