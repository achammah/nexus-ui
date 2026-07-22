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

---

## Polish pass — Phase 1 (resumed session, per-item status)

Verdicts are my own read; a blind reviewer + the lead decide. Everything below exercised live in the vite harness (desktop 1440 light/dark, mobile 390/430) with `reducedMotion: no-preference`.

### 1. Outline scroll — RE-VERIFIED FIXED (was flagged as a possible real clip bug)
Empirically settled the lead's open question with the long-doc harness (8 sections × 6 paragraphs):
- A real scroll container **forms**: `.nxDoc-main` scrollHeight 6155 > clientHeight 774. The page itself does **not** overflow (`documentElement.scrollHeight === innerHeight === 900`) — that is the *correct* signature (the inner element scrolls, not the document), not the clip the earlier short-seed measurement suggested.
- Clicking the last outline item (Section 8) drove `.nxDoc-main.scrollTop` to 4553; the heading landed at exactly `FOLD=24px` from the container top; the active highlight tracked to it; trailing runway (maxScroll 5381) lets late headings reach the fold.
- `scrollParentOf()` resolves the real scrollable ancestor from the live DOM at use time; the active-section listener is a single capture-phase document listener (hears whichever element scrolls). So it holds when embedded in a host that owns the scroll. Verdict: ✅ genuinely fixed, not a short-seed artifact.

### 4. Emoji / cover picker per page — DONE
Searchable emoji grid (categories, recents, random, remove) + **custom image upload as icon**, CSP-safe (bundled/generated/uploaded, no external host). Native `--nx-*` styling; touch renders as a sheet. `IconPicker`/`CoverPicker`/`PageIcon` + `emoji-data`. Shots 12-15.

### 5. Full mobile docs — DONE
Tree → drawer with scrim, touch editor/toolbar/slash, outline as a bottom sheet, sub-page nav + breadcrumb-back, touch pickers, no h-scroll. Verified 390 **and** 430 portrait, both themes. Shots `mobile-390-*`, `mobile-430-*`.

### 6. Composability — DONE
`WorkspaceConfig` makes every structural element a toggle + four named presets (wiki / single-doc / library / review); explicit flags override the preset; surface degrades coherently. `tree:"table"` = a record-table library view (`PageTable`) reusing the DataTable idiom — a pure config swap. Documented in `docs/RECIPES.md`. Verified live per preset (structure probes below) + light/dark shots 16-18.

| Preset | tree | table | crumbs | ⌘K | backlinks | outline | cover |
|---|---|---|---|---|---|---|---|
| wiki | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| single-doc | — | — | — | — | — | ✓ | ✓ |
| library | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| review | ✓ | — | ✓ | ✓ | ✓ | ✓ | — |

Explicit `outline:false` / `backlinks:false` overrides confirmed to win over the preset.

**Not in this pass:** items 2-3 (Notion controls, embedded chrome) were completed + committed in the prior session (commit 39a8c2d, sections above). ~~`suggestions`/`comments` toggles are deferred~~ — **SUPERSEDED at HEAD:** `suggestions` shipped as an orthogonal `WorkspaceConfig` toggle available at every preset level.

**tsc:** my lane (`blocks/document`, `record-core`) is clean. Pre-existing `blocks/workbook` errors are missing `@univerjs/*` deps — a different lane's concern, untouched by me.

---

## Phase 2 — Suggesting / track-changes (Word × Notion child)

Built by composing the app's EXISTING suggestions infra (`useSuggestions` + tracked-change widget + `SuggestionPanel`) into `DocumentSurface`. Verdicts my own; exercised live in the harness (desktop 1440, both themes).

| # | Behaviour | Verdict | Evidence |
|---|---|---|---|
| 1 | Editing ↔ Suggesting mode toggle | ✅ | toolbar segmented switch; `config.suggestions` gate |
| 2 | Edit captured as a tracked change (not committed) | ✅ | typed " and mid-market" in Suggesting → change `sug-b3` created, committed text unchanged |
| 3 | Inline insertion / deletion / substitution + author | ✅ | insertion (empty del, "You · insertion"), substitution (seed "third quarter → fourth quarter", "Ava Chen · edit"); del/ins widget both themes |
| 4 | ~~Materialise-on-blur (caret-safe while typing)~~ **SUPERSEDED at HEAD** | ✅ then, obsolete now | shipped as blur-deferred here; **replaced by mid-keystroke live rendering** — see "Real-time tracked changes" below. The `onBlur` reconcile remains as the live→settled handoff |
| 5 | Block+offset anchoring (empty-original bug) | ✅ FIXED | before: insertion matched every block via `includes("")` and rendered in b1/b2; after: `changesFor`/`buildBlockHtml`/`foldChange` anchor by `blockId`+`offset` |
| 6 | accept / reject per change | ✅ | accept folds "fourth quarter" into b2, insertion into b3; widget clears |
| 7 | accept-all / reject-all | ✅ | accept-all resolved both; committed text correct after blur |
| 8 | Review panel — count + jump-to + undo + comments | ✅ | "N pending · M resolved · T total"; `scrollToChange`; comment input persists to `reason` |
| 9 | Persistence | ✅ | `DocumentSnapshot.suggestions` + `PageNode.suggestions` + PageWorkspace `onDocChange`; harness onChange round-trips |
| 10 | Export honest about tracked marks | ✅ | md export captured: `[-third quarter-][+fourth quarter+]`; menu notes "1 tracked change marked" (md/html/pdf/docx all use the marked blocks) |
| 11 | record `richText` field NOT regressed | ✅ | regression view still renders server change (del/ins), no author attr, markdown mirror serialises to original |

Shots: `suggest-01-light.png`, `suggest-02-dark.png`.

**Scope note (corrected to HEAD):** tracks TEXT edits within a block, one active change per block per pass; structural edits (add/remove/retype a block) commit directly. ~~The focus-guard means a change materialises on blur, not mid-keystroke.~~ **NO LONGER TRUE** — changes now render mid-keystroke (see "Real-time tracked changes" below); this line described the superseded v1. `suggestions` is a real `WorkspaceConfig` toggle (superseding the Phase-1 "deferred" note); standalone threaded comments beyond per-change notes remain future work.

tsc clean on my lane throughout; pre-existing `blocks/workbook` @univerjs errors untouched.

---

## Handbook review batch + composability spectrum (resumed)

Live-verified in the harness. Addresses the lead's batch from the user's :4000 review.

| # | Issue | Verdict | Evidence |
|---|---|---|---|
| A | Default landing page too short to demo the outline | ✅ | root Aurora Handbook seeded long+structured: 11 outline entries, `.nxDoc-main` scrollHeight 3280 > clientHeight 812, outline click scrolls 0→2109 with tracking |
| 2 | Enter stacks "/" placeholders on every empty block | ✅ | scoped to `.ne-block:empty:focus` — 2 empty blocks, only the focused one shows the hint |
| 3 | Raw `[[c:gray|You]]` token leaking in the editor | ✅ | my editor renders it as gray "You" (no leak); ALSO hardened tracked-change widgets to `inlineMd` their del/ins so a suggested edit can't leak a raw token. If :4000 still shows raw, it's app-seeded content — my components render every `[[…]]` family live |
| 1a | Doc header "Search ⌘K" button lies when app owns ⌘K | ✅ | already gated on `cmdK` — `config.cmdK:false` hides the ws-kbar AND the tree-head search; no misleading ⌘K affordance remains |
| 1b | Expose page index for the app's unified search | ✅ NEW | `onPageIndex(entries:{id,title,path,icon}[])` fires on store change (verified: 5 entries w/ breadcrumb paths) + `onOpenPageRef(open)` — pair with `config.cmdK:false`. **Seam for pages-c to wire into `useGlobalSearch`.** |
| 4 | Import parity (DOCX + paste-from-Word) | ✅ | Import menu present ("From file .docx/.md/.html"); paste-from-Word HTML → blocks verified (h1 + **bold** + lists preserved). Export was already there. |
| NS | North-star spectrum: simple doc → full Notion | ✅ | presets `doc → review → wiki → workspace` (+ `library`, `single-doc` alias); `suggestions` ORTHOGONAL toggle ON at every level; verified per preset — doc/review no nav + suggesting available, wiki/workspace full nav, `suggestions:false` removes the mode switch |

Full Word-parity checklist (Phase 2 + this batch): suggesting mode ✅ · inline tracked insert/delete/substitute ✅ · author attribution ✅ · accept/reject per + all ✅ · review panel + jump-to + comments ✅ · persistence ✅ · export honesty ✅ · **DOCX import ✅ · paste-from-Word ✅** · Markdown/HTML/PDF export ✅ · suggestions as a composability toggle ✅.

tsc clean on my lane throughout; `blocks/workbook` @univerjs errors are another lane's, untouched.

---

## Real-time tracked changes (replaces the blur-deferred v1)

The user's requirement: the strikethrough + coloured insertion must appear INSTANTLY while typing — not on blur, and not after a debounce ("it takes time to load, it's not real time"). Shipped: **genuinely mid-keystroke, no debounce, no timers.**

**Approach.** A contenteditable can't do this by itself — if the browser performs the edit the removed text is gone (nothing left to strike), and rewriting `innerHTML` afterwards destroys the caret. So the editor now OWNS the edit in suggesting mode: a delegated native `beforeinput` listener intercepts insert/delete/replace, applies them to an explicit model, re-renders the del/ins, and restores the caret **synchronously inside the same event**. The marks are on screen before the keystroke returns — there is no async path to be late.

Model per edited block (committed text is never mutated):
`prefix | <del>deleted</del><ins>inserted</ins> | suffix`, caret indexed into `inserted`; `prefix+deleted+suffix` === committed, `prefix+inserted+suffix` === suggested.

| Case | Verdict | Evidence |
|---|---|---|
| Insertion live | ✅ | typed 15 chars — ins grew live, focus never left the block |
| Deletion live | ✅ | 5 backspaces struck "brief" instantly (`<del>brief</del>`) |
| Substitution live | ✅ | selected "enterprise", typed → `<del>enterprise</del><ins>S…</ins>` on the FIRST keystroke, then 18 more chars appended |
| Caret stability | ✅ | caret stayed inside `<ins>` at the right offset across every keystroke (offset 18/18); no jump or reversal |
| Focus stability | ✅ | required re-taking focus before caret restore — a nested `contenteditable` island dropped focus after innerHTML replacement and swallowed everything after the first keystroke (found + fixed) |
| Live→settled handoff | ✅ | on blur the live widget becomes the settled one, same del/ins, no flicker |
| Accept on a live change | ✅ | folds correctly ("We will target SMB and mid-market customers first.") |
| Editing mode unaffected | ✅ | controller inert; typing commits normally, no marks |
| record richText regression | ✅ | server change still renders, mirror serialises to original |

Styling verified identical between live and settled widgets (ins `rgb(79,70,229)` underline; del strike).

**Honest limitation:** IME/composition input is not intercepted (composed text would need the browser's default). It falls through to the previous diff-based capture — the change is still tracked and materialises on blur, so it degrades rather than corrupting. Latin typing (the intercepted path) is fully live.

Shot: `suggest-03-live-mid-edit.png` — taken MID-EDIT with focus still in the block.

---

## Native-chrome pass: code-block language picker (+ emoji-as-UI sweep)

The code block's language control was a raw `<select>` — the last OS-chrome control in the surface. Audit confirms **0 `<select>` elements remain**.

**Deviation, approved:** the brief said route it through the Radix/shadcn menu used elsewhere. I used the EDITOR's own `--nx-*` popover grammar instead, because shadcn here is Tailwind-v4-dependent via `shadcn.css` while `NotionEditor` is deliberately self-contained (React + lucide only, ships its own CSS) and mounts inside other surfaces as the record `richText` field. Importing shadcn would add a Tailwind styling dependency to that component and render unstyled in the harness (making light/dark verification impossible). The editor's ~8 other pickers are all `--nx-*` popovers. Flagged as a deviation; lead confirmed: keep the popover.

| Check | Verdict | Evidence |
|---|---|---|
| Native `<select>` replaced | ✅ | trigger pill + listbox, accent check on the active language; `document.querySelectorAll('select').length === 0` |
| Matches in-editor grammar | ✅ | same tokens/header/selected-item treatment as the slash menu; light + dark shots |
| Keyboard accessible | ✅ | opens focused on the selected item; ArrowDown moved focus `ts → js`; Escape closes + returns focus; Enter activates |
| Syntax highlighting intact | ✅ | switched to `python`, re-highlighted, `.ne-t-*` tokens present |
| Copy affordance + palette | ✅ | untouched; tokens already use `--nx-opt-*` |

**‼ Trap worth remembering (will bite the next picker added inside a clipped block):** `.ne-code` sets `overflow:hidden` to clip its rounded body, which **clipped an absolutely-positioned menu to three items**. Fix: position the menu `fixed` from the trigger's `getBoundingClientRect()` (the pattern the slash menu already uses), and flip above when there is no room below. Any popover rendered inside `.ne-code`, `.ne-image`, or a table cell needs the same treatment.

### Emoji-as-UI sweep (content emoji deliberately untouched)
Page icons and callout glyphs in CONTENT are correct Notion behaviour and were left alone. Fixed three UI-control uses:
- the add-icon control rendered a fullwidth `＋` text glyph → a lucide icon (a text character as a UI control renders per-platform)
- page BLOCK and page-LINK MENU fell back to a raw `📄` for icon-less pages → the `PageIcon` + lucide pairing the tree/switcher/backlinks already used
- inline page links injected `📄` via CSS → a masked SVG from the app's icon set, inheriting `currentColor` (tracks the link colour in both themes)

**Known inconsistency (deliberate, with reason):** the inline page-link glyph is a GENERIC document mark, not the page's own icon — unlike the block/menu/tree, which show the real icon. Resolving it per link needs a page resolver threaded through `inlineMd`/`buildBlockHtml` **and** `serializeBlock` taught to skip the injected icon node — and `serializeBlock` is the single path that defines committed block text (suggesting mode depends on it). Not worth that correctness risk for a decorative glyph; the raw-emoji problem is solved either way.

### HTML export dropped the code language — FIXED
Was: `<pre><code>` with no language, so an HTML round-trip returned `lang:"plain"` while Markdown kept it — an asymmetry in a surface whose selling point is Word/Notion-grade import/export. Now exports `<code class="language-python">` (the convention highlighters expect) and the importer reads it back.

| Round-trip | Before | At HEAD |
|---|---|---|
| Markdown | `python` ✅ | `python` ✅ |
| HTML (ours) | `plain` ❌ | `python` ✅ |
| HTML from another highlighter (`language-rust`) | `plain` ❌ | `rust` ✅ |
| HTML with no language | `plain` ✅ | `plain` ✅ |

Shots: `codeblock-01-lang-light.png`, `codeblock-02-lang-dark.png`. tsc clean on my lane.
