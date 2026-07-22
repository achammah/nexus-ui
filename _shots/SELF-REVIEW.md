# SELF-REVIEW v2 — P0 page workspace (Notion × Google Docs)

Lane: `feat/document-depth` (extends PR #37). Scope reframed by the user to center the **PAGE SYSTEM**: everything is a page, pages nest and reference each other; the editor edits ONE page within a linked workspace.

References held to: **Notion** (page tree, nesting, sub-pages, links + backlinks, Cmd-K, blocks, slash, toggles, callouts, outline) and **Google Docs** (inline toolbar, find & replace, Word import/export, page chrome).

**I am not certifying this.** Verdicts are my own read; lead + a blind reviewer decide. Every feature was exercised live in a vite harness (desktop light/dark 1440, mobile 390); the store spine ops + import/export round-trips were asserted programmatically (histograms / tree integrity), not eyeballed. Shots in this folder.

## P0 — page system (the reframe headline)

| # | Feature | Ref | Verdict | Evidence |
|---|---|---|---|---|
| 1 | **Page store** — flat adjacency list (id/title/icon/parentId/order/blocks), fractional order, external-writer-tolerant | — | ✅ spine solid | `page-store.ts`; ops asserted: create/move/duplicate/delete/backlinks/breadcrumb all correct, cycle-guard rejects moving a page into its own descendant |
| 2 | **Nested sub-pages** (infinite) + **page tree** sidebar (expand/collapse, actions, favorites) | Notion | ✅ | `10` — Handbook → Engineering → {Architecture, Onboarding} + Roadmap; favorites shelf |
| 3 | Tree **drag-to-move** (before / after / inside via movePage) | Notion | ⚠ logic verified, HTML5 tree-DnD not driven in-harness | movePage before/after/inside + reparent asserted programmatically; the row DnD handlers wire to it |
| 4 | **Breadcrumbs** (root→here, live) | Notion | ✅ | `11` — “Aurora Handbook › Engineering”; a link click reached a 3-level crumb |
| 5 | Inline **sub-page blocks** (`/page`, click to open) | Notion | ✅ | `10`/`11` — Engineering + Roadmap cards on home; clicking Engineering opened it + updated crumbs/tree/backlinks |
| 6 | **`[[` / `@` page-link autocomplete** → clickable link | Notion | ✅ | typed `[[Arch` → menu ranked Architecture + “New page” → selected → inserted `data-page` link → **clicking it navigated to Architecture** (3-level crumb) |
| 7 | **Backlinks** panel (“linked references”, link/sub-page/child kinds + a link index) | Notion | ✅ strong | `11` — Engineering shows 3 refs from Handbook with PARENT / SUB-PAGE / LINK tags |
| 8 | **⌘K quick-switcher** (jump to any page) | Notion | ✅ | `12` — ⌘K opens; keyboard-nav + Enter |
| 9 | **Full-text search** across pages (title + body) | Notion | ✅ | `12` — “onboard” → Onboarding (title) then Aurora Handbook (body snippet) |
| 10 | Cover + page **icon/emoji** header | Notion | ✅ | `10`/`13` — cover + 📘 icon per page |

## P0 — core editor + import/export (from PR #37, additive, still green)

| Feature | Verdict | Evidence |
|---|---|---|
| Blocks: H1-3, to-do, toggle, callout, code (syntax+lang), nested lists, quote/divider/image/table | ✅ | PR #37 shots `01`,`04`; the new `page` block is additive |
| Slash menu (now incl. `/page`), markdown shortcuts, drag-reorder, turn-into, Tab nesting | ✅ | `03` + workspace |
| Inline toolbar (bold/italic/underline/strike/code/link/highlight/color) | ✅ | `05` |
| Live outline / TOC (click-scroll, active highlight) | ✅ | `01`,`10` |
| Import/Export — MD/HTML/PDF/DOCX + paste-from-Word/GDocs | ✅ | `06`; round-trips asserted (HTML lossless, DOCX preserves structure+text, GDocs/Word paste normalized) |
| Both themes, `--nx-*` only; mobile-by-construction | ✅ | `13` dark, `14` mobile tree drawer |
| **Regression:** record `richText` field unchanged | ✅ | `09` — tracked-change widget + `blocksToMarkdown` intact; `page` excluded from the suggestions text-guard so a richText field never breaks |

## Bugs found + fixed during review

- **setState-in-render** — DocumentSurface's `patch` called `onChange` *inside* the `setSnap` updater (harmless in PR #37 where onChange was a no-op; once PageWorkspace's onChange setStates the store, React warned "cannot update PageWorkspace while rendering DocumentSurface"). Fixed with a `snapRef` — compute next + fire onChange outside the updater. (No console errors after.)
- **Seed title/H1 duplication** — every seed page repeated its title as a leading H1; removed (the page title is the heading).
- (PR #37, still standing) callout class-collision + code-highlighter markup leak + GDocs `<b>`-wrapper paste flattening — all fixed there.

## The brutal "still a toy?" test

- Does it read as a **workspace**, not one text box? **Yes** — a page tree, nested sub-pages, breadcrumbs, per-page covers/icons.
- Do pages actually **reference each other**? **Yes** — sub-page blocks + `[[` links, and a backlinks panel that shows what points here (with the *kind*). This is the Notion “linked references” model, working.
- Can I **jump anywhere** fast? **Yes** — ⌘K full-text switcher.
- Is the **spine** sound (not a demo hack)? **Yes** — a flat, external-writer-tolerant store with fractional ordering; every derived view (tree/crumbs/backlinks/search) is a pure scan; cycle-guarded moves.
- Did I ship the class or one instance? **The class** — `PageWorkspace` is config-driven and value = the whole store; the seed is just a demo.
- **Weakest points (honest):** (a) tree drag-to-move: the store logic (before/after/inside) is asserted but I did not drive the HTML5 row-DnD in-harness — needs a manual pass; (b) no per-page cover on child pages in the seed (cosmetic); (c) full-text search is a linear scan (fine to hundreds of pages; an index is a P1 optimization); (d) icon/cover pickers still cycle a set rather than a full picker. None are toy-tier.

## Definition of Done (P0)

- [x] Page store spine (flat, fractional order, external-writer-tolerant) — reported to lead early for sanity-check; pure + node-testable.
- [x] Nested sub-pages, tree sidebar, breadcrumbs, sub-page blocks, `[[`/`@` links + autocomplete, backlinks, ⌘K, full-text search — all verified live.
- [x] Additive over `NotionEditor` — the `page` block + `pageContext` seam; record `richText` field unchanged (verified).
- [x] `PageWorkspace` exported (value = PageStore) — what a Pages host mounts for `kind:document`.
- [x] Native `--nx-*`, both themes, config-composable, mobile; documented in `docs/RECIPES.md`.
- [x] `tsc --noEmit` clean (only the 7 pre-existing `@univerjs/*` errors, another lane). `vite build` clean; docx/mammoth still lazy chunks; base +7 kB gz over PR #37.
- [x] Catalog regenerated; PROVENANCE/NOTICE/RECIPES/DEPENDENCIES updated.
- [ ] P1 (equation/columns/media/bookmark/embed/templates/print-layout) + P2 (synced blocks, link-to-records, comments, presence, version history) — **not started; reporting P0 first per the brief.**
- [ ] Blind review + lead sign-off — **pending (theirs to give).**
