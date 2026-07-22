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

---

# Polish pass — live-mount defects (outline scroll · Notion controls · embedded feel)

Driven against a harness view that **reproduces the host mount** (app shell with its own rail
and breadcrumb, workspace filling a bled content area). The standalone view could not surface
these — every one of them only appears once the surface is nested in someone else's chrome.

Verified with an **isolated browser** at `reducedMotion: "no-preference"` (real motion — the
smooth-scroll behaviour under test is exactly what a reduced-motion context hides).
Harnesses: `_preview/verify.mjs` (19 assertions) and `_preview/drag.mjs` (native DnD).

## 1. Outline scroll — FIXED

Three separate causes, all real:

| Cause | Fix |
|---|---|
| The jump used `scrollIntoView` and the tracker bound its listener to `containerRef` — both assume the surface owns the scroll. Nested in a host, the real scroller is a different element. | `scrollParentOf(el)` resolves the **actual** scrollable ancestor from the live DOM at use time; the jump scrolls *that* element to a computed offset. |
| The active-section listener was bound once to whichever target was scrollable **at mount** — if that changed, tracking went dead. | One **capture-phase** `scroll` listener on `document`: scroll events do not bubble but they do capture, so it hears whichever element scrolls. |
| No trailing runway — a late heading **could not reach the fold**, because the container was already at its scroll end. That is the "gets stuck at a specific section" report. | `.nxDoc-page` bottom padding `55vh` (45vh mobile). |

Plus a `pinnedUntil` guard so the tracker does not re-derive the section mid-flight and snap
the highlight back to where the scroll started.

**Evidence:** all 8 outline entries land their heading at **24px** from the fold (`24/24/24/24/24/24/24/24`), and the clicked entry stays highlighted. Shot `polish-01-outline-landed`.

## 2. Notion controls — FIXED

- **Inline title edit.** The title was already an `<input>` but had zero affordance and was
  visually competing with a *second* title in the toolbar. It now carries a hover wash + text
  cursor, and the **current breadcrumb** click/double-click focuses and selects it (Notion's
  rename-from-the-trail gesture, resolved onto the one true title).
- **Block hover affordances were being clipped** — the handles sit at `left:-74px` but the page
  column had an 8px left pad inside an `overflow-x:hidden` scroller, so at real widths the
  `+` / grip / delete simply never appeared. This is likely most of what read as "not
  Notion-like": the single most recognisable Notion affordance was invisible. The page now
  carries **symmetric 72px gutters** (text column stays centred at 720/940) and the handles
  render inside the left one. Shot `polish-02-block-handles`.
- **Double-click a tree row renames it inline** (+ a Rename item in the ••• menu).
- **Bug this uncovered:** `PageTree` declared its row component *inside* the render body, so it
  was a new component type on every render — React unmounted and remounted the whole tree on
  each state change, tearing down the rename input the instant it opened (and every focus/drag
  state with it). Converted to a render function.
- Word count said "**1 words**". Fixed.

## 3. Embedded feel — FIXED

- **Header stack collapsed to ONE row.** `DocumentSurface` no longer repeats the document
  title when a host supplies `topBar`; the workspace always owns the header's left slot, and
  the word count moved to the right cluster. The breadcrumb bar lost its own bar chrome — it
  now renders *inside* the single header row.
- **The WORKSPACE panel header is gone.** Its two controls moved into the tree's own head
  (which is now the sidebar head), matching Notion's sidebar shape: actions row, then
  `Favorites` / `Pages` sections.
- **Frame continuity.** `.nxWs`, `.nxWs-sidebar` and `.nxDoc` paint **no background of their
  own** — they inherit the host surface, so there is no second frame inside the app shell.
  Identical standalone (hosts sit on `--nx-bg`). The sidebar reverts to an opaque fill only
  when it becomes an overlay drawer at ≤820px, where it must.
- **Two search affordances** sat side by side in the header; the trail-less wiring now shows
  only the tree's.

New prop: **`breadcrumbs?: boolean`** on `PageWorkspace` — set `false` when the host renders
its own breadcrumb for the page, so the trail is never doubled.

## 4. Tree drag-to-move — now actually verified (was flagged)

`_preview/drag.mjs` dispatches the real `DragEvent` sequence with a live `DataTransfer`
against the real React handlers, **spread across frames** (React must commit the dragstart
state before the first dragover — a synchronous burst is silently ignored, which is why a
naive DnD synthesis "fails" here). Reparenting "Roadmap" inside "Engineering" moves it from
depth 1 → 2 in the live UI. Shot `polish-11-tree-drag`. The earlier flag is cleared.

## Coverage

| Unit | Read at latest render | Verdict | Open defects |
|---|---|---|---|
| Embedded — host owns the trail (light) | ✅ `polish-04-embedded-light` | ✓ one header, continuous frame | header-left is empty in this wiring (see note) |
| Embedded — workspace owns the trail (light) | ✅ `polish-04b-embedded-own-trail` | ✓ recommended wiring | — |
| Embedded (dark) | ✅ `polish-05-embedded-dark` | ✓ | — |
| Long document + outline + handles | ✅ `polish-02-block-handles` | ✓ | — |
| Tree inline rename | ✅ `polish-03-tree-rename` | ✓ | — |
| Standalone page workspace | ✅ `polish-06-workspace-standalone` | ✓ unchanged | — |
| Single document (no workspace) | ✅ `polish-07-single-document` | ✓ keeps its own title crumb | — |
| Record `richText` regression | ✅ `polish-08-regression-richtext` | ✓ blocks + tracked changes intact | — |
| Mobile 390px (embedded) | ✅ `polish-09-embedded-mobile` | ✓ drawer starts closed, no overflow | — |
| Mobile 390px (standalone) | ✅ `polish-10-workspace-mobile` | ✓ | — |
| Tree drag-to-move | ✅ `polish-11-tree-drag` | ✓ | — |

**Regressions I introduced and caught here:** the transparency change made the mobile overlay
drawer see-through and it opened over the content on load — both fixed (opaque fill as an
overlay; drawer starts closed below 820px). Delete leaves the in-flow touch handle rail at
≤640px so it stops eating the reading column.

`tsc --noEmit` clean (only the 7 pre-existing `@univerjs/*` errors from another lane).
`vite build` clean. Console clean. **19/19 + 1/1 assertions green.**

**Not started:** P1/P2 (equation, columns, media, bookmark, embed, TOC block, templates,
print) — awaiting the explicit go.
