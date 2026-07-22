# `blocks/document` — the document surface

True at **`45a2a08`** (`feat/document-depth`). Statements below were verified against that commit; if you are reading much later, re-check the ones marked **[verify]**.

---

## What this folder IS

A **document surface**: a block editor plus the page system around it. Not a rich-text widget — the mechanism is:

1. A document is an **array of blocks** (`Block[]`), each a plain object. There is no ProseMirror/Slate document model, no schema engine, no plugin registry.
2. Each text block is rendered into a `contenteditable` element as **HTML built from its text** (`buildBlockHtml`), and read back out as text (`serializeBlock`). That round trip — text → DOM → text — is the whole editing engine.
3. Inline formatting is **markdown-ish tokens inside the block's text** (`**bold**`, `[[page:id|title]]`, `[[c:blue|coloured]]`), not a mark tree. The DOM is a *rendering* of the text; the text is the truth.
4. Pages nest via a **flat adjacency list** (`parentId` + fractional `order`), never nested data. Every derived view (tree, breadcrumbs, backlinks, search) is a pure scan over that flat map.

Two mount sizes, same contract (`value` / `onChange` / `reloadNonce`):

- **`DocumentSurface`** — ONE document. Host owns the `DocumentSnapshot`.
- **`PageWorkspace`** — a whole linked workspace (tree, breadcrumbs, backlinks, ⌘K). Host owns the `PageStore`. Mounts a `DocumentSurface` per active page.

The surface is **free-surface**: it never fetches or persists. The host holds the value and receives every change.

### Scope note
This doc also covers the `record-core` files this surface owns (`NotionEditor`, `useSuggestions`, `SuggestionPanel`, `DocumentOutline`, `editor-io`, `PageIcon`). The rest of `record-core` (DataTable, Kanban, RecordPage, views) belongs to other lanes — don't take this doc as authority there.

---

## File map

### `blocks/document/`
| File | What it is |
|---|---|
| `index.ts` | Public barrel. Eager (the surface is light); `docx`/`mammoth` stay lazy inside `editor-io`. |
| `DocumentSurface.tsx` | One document: chrome (cover, icon, title, word count, page width, find & replace, import/export), the outline rail, the suggesting mode + review rail. Owns `DocumentConfig`. |
| `PageWorkspace.tsx` | The workspace: tree/table nav, breadcrumbs, ⌘K switcher, backlinks, `WorkspaceConfig` + preset spectrum, the `PageIndexEntry` search seam. |
| `PageTree.tsx` | The nested page tree (expand/collapse, drag-to-move, per-row actions, favourites). Presentational — every mutation is a callback. |
| `page-store.ts` | The `PageStore` model + every pure operation (create/move/duplicate/delete/rename/backlinks/breadcrumb/search). No React. |
| `snapshot.ts` | `DocumentSnapshot` type, `isDocumentSnapshot` guard, store-key helper, cover presets, `seedDocument`. |
| `IconPicker.tsx` | Emoji picker (search, categories, recents, random, remove) + custom image upload as icon. CSP-safe: bundled/generated/uploaded only. |
| `CoverPicker.tsx` | Cover picker (gradient/flat presets + uploaded image, reposition). |
| `emoji-data.ts` | The bundled emoji set + keywords. No external font/CDN. |
| `document.css` | `DocumentSurface` chrome, in `--nx-*` tokens only. |
| `page-workspace.css` | `PageWorkspace` + `PageTree` chrome, `--nx-*` only. |

### `record-core/` files this surface owns
| File | What it is |
|---|---|
| `NotionEditor.tsx` | **The editor.** Block rendering, the text↔DOM round trip, slash menu, inline toolbar, markdown shortcuts, page-link autocomplete, drag-reorder, tracked-change rendering, and the live suggesting controller. Ships its own CSS string — no Tailwind, no shadcn (deliberate: it mounts inside other people's surfaces). |
| `useSuggestions.ts` | The accept/reject/undo engine over `Block[]` + `Suggestion[]`. Pure-ish; caller owns persistence. |
| `SuggestionPanel.tsx` | The review rail (counts, per-change accept/reject, accept-all/reject-all, undo, notes). Presentational. |
| `DocumentOutline.tsx` | Live table of contents derived from headings; resolves the real scroll container at use time. |
| `editor-io.ts` | Import/export: Markdown, HTML, PDF (print), DOCX. `docx`/`mammoth` are dynamically imported here. |
| `PageIcon.tsx` | Renders a page icon (emoji or uploaded image) with a `fallback` for icon-less pages. |

---

## The model

### Blocks
```ts
type Block =
  | { id; type: "p"|"h1"|"h2"|"h3"|"quote"|"ul"|"ol"; text: string; indent?: number }
  | { id; type: "todo"; text; checked?; indent? }
  | { id; type: "toggle"; text; collapsed?; indent? }
  | { id; type: "callout"; text; emoji?; tone?; indent? }
  | { id; type: "code"; text; lang? }
  | { id; type: "divider" }
  | { id; type: "image"; src; caption? }
  | { id; type: "table"; rows: string[][] }
  | { id; type: "page"; pageId; title?; icon?; indent? }      // an inline sub-page card
```
`text` carries inline tokens. The renderer (`inlineMd`) understands: `**b**`, `*i*`, `~~s~~`, `++u++`, `==highlight==`, `` `code` ``, `[label](url)`, `[[page:<id>|<title>]]`, `[[c:<colour>|text]]`, `[[h:<colour>|text]]`.

Three sets in `NotionEditor` gate behaviour — `TEXTLIKE` (gets the shared editable element), `TEXT_BEARING`, `INDENTABLE`. **A new block type must be added to the right set or it will silently not indent / not accept the editable path.**

### Documents and pages
```ts
DocumentSnapshot = { id, title, blocks, icon?, cover?, coverY?, pageWidth?, version?, suggestions? }
PageNode         = { id, title, parentId, order, blocks, icon?, cover?, coverY?, suggestions?, favorite?, createdAt, updatedAt }
PageStore        = { version, pages: Record<id, PageNode>, activeId?, expanded? }
```
- Structure is **`parentId` + fractional `order`** — moves are O(1) and never renumber siblings.
- `PageWorkspace` maps the active `PageNode` → a `DocumentSnapshot` for `DocumentSurface`, and maps changes back through `setPageBlocks` / `setPageSuggestions` / `renamePage` / `setPageIcon` / `setPageCover`.
- **Persistence is the host's.** Nothing here writes to storage. `documentStoreKey(pageKey)` is only a suggested key convention.

### Who else reads this model
`Block[]` is **also the record `richText` field format** — `RecordPage` mounts a bare `NotionEditor` over a record field, with server-proposed `changes`. That is why the editor is Tailwind-free and why changes to `serializeBlock`, `changesFor`, or the `InlineChange` shape are cross-lane edits. Verify the record field still round-trips before shipping any of those.

---

## Seams (named extension points)

| Seam | How |
|---|---|
| Host owns the document | `<DocumentSurface value={snapshot} onChange={setSnapshot} reloadNonce={n} />` |
| Host owns a whole workspace | `<PageWorkspace value={store} onChange={setStore} />` |
| Turn features on/off | `DocumentConfig` (per document) and `WorkspaceConfig` (per workspace, with the `doc → review → wiki → workspace` preset spectrum). `suggestions` is orthogonal — available at every level. |
| Restrict the block set / menus | `DocumentConfig.editor` → `EditorConfig` (`blocks`, `slashMenu`, `toolbar`, `markdownShortcuts`). |
| Page navigation seam | `PageContext` — `{ resolve, search, onOpenPage, onCreateSubPage }`. This is what makes `[[` links and sub-page blocks resolve. A standalone `DocumentSurface` omits it and those features stand down. |
| Host's unified search | `onPageIndex(entries)` emits `{id,title,path,icon}[]` on every store change; `onOpenPageRef(open)` hands back an opener. Pair with `config.cmdK:false` so the app owns one palette. |
| Review attribution | `author={{ name, color }}` — stamped on every tracked change. |
| Custom review UI | `useSuggestions(blocks, onBlocks, changes, onChanges)` + `SuggestionPanel` are exported separately; you can build your own rail on the same engine. |
| Import / export | `importFile(file)` → `{blocks, warnings}`; `exportMarkdown/Html/Pdf/Docx(blocks, title)` download; **`docxBlob(blocks, title)` returns a Blob without downloading**. |

### ‼ The e-signature seam: mount over a host-owned .docx, edit, get docx back

**Status: mostly works today; three named gaps.** Verified at `45a2a08`.

What works right now, with public exports only:

```tsx
import { DocumentSurface, importFile, docxBlob, type DocumentSnapshot, type Suggestion } from "@nexus/ui";

// 1. open a .docx the host owns  → blocks
const { blocks, warnings } = await importFile(file);          // lazy-loads mammoth
const [doc, setDoc] = useState<DocumentSnapshot>({ id: contractId, title: file.name, blocks });

// 2. edit / review it, attributed, with tracked changes persisted on the snapshot
<DocumentSurface
  value={doc}
  onChange={setDoc}                                            // doc.suggestions rides along
  author={{ name: counterpartyName }}
  config={{ suggestions: true, chrome: false }}                // chrome:false = no cover/icon/title
/>

// 3. send it back out as a real file
const blob = await docxBlob(doc.blocks, doc.title);            // Blob — upload/attach/sign it
```
Suggestions persist on `doc.suggestions` (a `Suggestion[]`), each carrying `author`, `blockId`, `offset`, `original`, `replacement`, `status`. The host can inspect/approve them out-of-band.

**GAP 1 — the editing mode is not controllable.** `mode` is internal `useState` in `DocumentSurface` (line ~137) with no prop. You cannot mount directly in Suggesting mode, force review-only for a counterparty, lock Editing for the owner, or observe mode changes.
*Fix path (small, ~10 lines):* add `mode?: "edit"|"suggest"`, `defaultMode?`, `onModeChange?` and make the internal state controlled-or-uncontrolled. Ask this lane; do not fork the component.

**GAP 2 — no headless way to produce the FINAL accepted document.** `foldChange` (which applies `original → replacement` at the anchor) is module-private inside `useSuggestions.ts`, and `useSuggestions` is a React hook — so a server or a non-React job cannot compute "the contract with all accepted changes applied".
*Fix path (small):* export the pure fold as e.g. `applySuggestions(blocks, changes): Block[]`. It is already pure; it just isn't exported.

**GAP 3 — DOCX export does NOT emit Word tracked-change revisions.** There are no `w:ins`/`w:del` revisions in the output. Pending suggestions are rendered as **literal bracket text** — `[-old-][+new+]` — by `blocksWithTrackedMarks`, which is *also* module-private in `DocumentSurface.tsx`. So `docxBlob(doc.blocks, …)` called directly emits the ORIGINAL text with no marks at all, silently dropping pending suggestions.
*Fix path:* (a) trivial — export `blocksWithTrackedMarks` so a host can choose marked-vs-clean export; (b) larger — emit real OOXML `w:ins`/`w:del` revisions so Word shows native tracked changes. (b) is the one an e-signature product probably actually wants, and is a genuine piece of work in `editor-io.ts`, not a config flag.

**Read GAP 3 before designing the flow**: "export the contract with the counterparty's redlines" does not work as you'd expect today.

Also relevant to contracts: see the round-trip table below — **`todo` / `callout` / `code` degrade to plain paragraphs through DOCX**. Headings, lists, tables and all text survive.

---

## How to add X

### 1. Add a new block type
1. `NotionEditor.tsx` — add the variant to the `Block` union.
2. Add it to the right membership set: `TEXTLIKE` (uses the shared `editableText` element — do this unless it renders custom UI), `TEXT_BEARING`, `INDENTABLE`.
3. If it is text-like, add its tag to `TAG` so the element renders with the right HTML tag; otherwise add a branch in the block render (see `case b.type === "code"` / `"page"` for the custom-UI shape).
4. Add a `COMMANDS` entry (icon, label, hint, keywords) so `/slash` can insert it.
5. Round trips — you must handle it in **four** places or it will be silently lost:
   - `blocksToMarkdown` + `markdownToBlocks` (`NotionEditor.tsx`)
   - `blocksToHtml` + `htmlToBlocks`
   - `docx` builder in `editor-io.ts`
   - `textToBlocks` if it should be creatable from pasted plain text
6. Style it in the `NotionEditor` CSS string with `--nx-*` tokens only.

### 2. Add a slash command that isn't a block
Add to `COMMANDS` and handle the key in `applyCommand(blockId, cmd)`. Commands that need a picker should open a popover — **and if it renders inside `.ne-code`, `.ne-image` or a table cell, position it `fixed` from the trigger rect** (see Traps).

### 3. Add an export format
1. Write `exportX(blocks, title)` in `editor-io.ts`. Keep any heavy dependency behind a dynamic `import()` — that is why the base bundle stays light.
2. If it is lossy, say so in the round-trip table below rather than silently degrading.
3. Add a button in the `DocumentSurface` export menu, and use `exportBlocks` (not `snap.blocks`) so pending tracked changes are marked rather than dropped.
4. Export it from `record-core/editor-io` and the root barrel if hosts should call it directly. Prefer also shipping a `xBlob()` variant that returns bytes without downloading — hosts integrating server-side need bytes, not a download (see GAP 3).

---

## Invariants and traps

### ‼ `serializeBlock` is the single path that defines committed block text
Every keystroke, paste and inline-format action ends with `serializeBlock(el, pendingChanges)` walking the block's DOM back into text. Its output **is** the block's `text`. Consequences:

- Anything you inject into a block's DOM becomes part of the text unless `serializeBlock` is taught to skip it.
- **Suggesting mode rides on it**: a tracked-change widget deliberately serialises to its **`original`**, so a half-reviewed block still yields the untouched committed text. The live widget uses cid `__live__`, which is not a real change id — `serializeBlock` falls back to the `<del>` text for an unknown cid, which is exactly the original. That is intentional, not a leftover.
- **This is why the inline page-link glyph is a CSS `::before`, not a DOM node.** Rendering each link's *real* page icon would need a resolver threaded through `inlineMd`/`buildBlockHtml` **and** `serializeBlock` taught to skip the injected icon node. That change was proposed and **declined**: it puts a decorative glyph in the one code path that defines committed text (and therefore suggestion correctness). If you are about to make it, you are repeating a rejected change — get it reviewed with tests over the record `richText` field first.

### ‼ Popovers inside clipped blocks
`.ne-code` sets `overflow:hidden` to clip its rounded body. An absolutely-positioned menu inside it **gets clipped** (this shipped once as a language menu showing only three of thirteen items). Any popover rendered inside `.ne-code`, `.ne-image`, or a table cell must be positioned **`fixed` from the trigger's `getBoundingClientRect()`**, and should flip above when there is no room below. `.ne-langmenu` and the slash menu both do this.

### ‼ The focus guard
A block's DOM is only re-rendered from the model when it is **not** focused (`document.activeElement === el` → skip). This keeps the caret alive while typing. Two consequences:
- After changing a block's model while it is focused, the DOM will not update until blur — that is by design.
- The live suggesting controller relies on it: it owns the focused block's DOM outright and React does not clobber it.
`onBlur` reconciles the DOM back to the model — that is the live→settled handoff.

### ‼ Tracked-change anchoring
`InlineChange` has two anchoring modes and they must not be confused:
- **Anchored** (`blockId` + `offset` set) — the live-capture path. The only correct mode for insertions/deletions.
- **Substring** (no `blockId`) — server-proposed substitutions, matched by `original` text.

An insertion has an **empty `original`**. `"anything".includes("")` is `true`, so an unanchored empty-original change matches **every block** — this shipped once as an insertion widget rendering into the wrong paragraphs. `changesFor` now requires `c.original !== ""` on the substring path. Keep that guard.

### Other invariants
- **Never mutate committed text in suggesting mode.** `prefix + deleted + suffix` must always reconstruct the committed text exactly; `prefix + inserted + suffix` is the suggested text.
- **`--nx-*` tokens only** in this surface. No Tailwind, no shadcn inside `NotionEditor` — it mounts inside other surfaces, and shadcn here requires Tailwind v4 via `shadcn.css`.
- **No external hosts** — icons/covers are bundled, generated, or user-uploaded data URIs (strict CSP).
- **Self-bound height.** `.nxWs`/`.nxDoc` set `max-height: calc(100dvh - var(--nx-doc-inset, 0px))` because `height:100%` only bounds a scroll container when the parent is bounded — many hosts' content areas grow to content. A host with a topbar sets `--nx-doc-inset` to its height. Remove this and long documents stop scrolling.
- **Page moves are cycle-guarded** (`movePage` rejects moving a page into its own descendant). Keep that if you add new move paths.

---

## The suggesting / tracked-changes model

**Renders mid-keystroke, not on blur, not debounced.** (It was blur-deferred in an earlier version; that is superseded.)

A `contenteditable` cannot do this by itself: if the browser performs the edit, the removed text is gone (nothing left to strike), and rewriting `innerHTML` afterwards destroys the caret. So in suggesting mode the editor **owns the edit**:

1. A delegated native **`beforeinput`** listener on the editor root intercepts `insertText` / delete / replace.
2. It applies the edit to an explicit model — `{ blockId, prefix, deleted, inserted, suffix, caret }`, caret indexed into `inserted`.
3. It re-renders the block's del/ins HTML and **restores the caret synchronously in the same event**. No timers, so nothing can lag.
4. It reports the change via `onSuggestChange(blockId, change|null)`; `DocumentSurface` persists it to `snapshot.suggestions` keyed `sug-<blockId>` (one active change per block per pass).

Details that matter:
- The **live** widget carries no `contenteditable` attributes. An earlier version made `<ins>` a nested editable island, which **dropped focus the instant `innerHTML` was replaced — only the first character was ever captured.** The controller intercepts everything anyway, so the block stays one editable host.
- Selecting text and typing folds the selection into `deleted` and the typed text into `inserted` in one gesture (the substitution case).
- On blur the live widget hands off to the settled widget (`buildBlockHtml` + the persisted change) — same del/ins, no flicker.
- Accept/reject/undo is `useSuggestions`; accept folds `original → replacement` at the anchor, reject/undo reverts.
- **IME/composition is not intercepted** (composed text needs the browser's default). It falls through to a diff-based capture — still tracked, materialises on blur. Degrades, does not corrupt.

---

## Import / export round-trip contract

| Format | In | Out | Fidelity |
|---|---|---|---|
| Markdown | `markdownToBlocks` | `blocksToMarkdown` | Lossless for the supported block set. |
| HTML | `htmlToBlocks` | `blocksToHtml` | Preserves to-do / toggle / callout / nesting. |
| DOCX | `importFile` (lazy `mammoth`) | `exportDocx` / `docxBlob` (lazy `docx`) | Headings, lists, tables and all text survive. **`todo`, `callout`, `code` degrade to plain paragraphs** — Word has no native equivalent (the same boundary Google Docs hits). |
| PDF | — | `exportPdf` | Print-styled window; one-way. |
| Paste | `htmlToBlocks` on `text/html` | — | Word/Google-Docs paste is normalised (headings, bold, lists preserved). |

**Code-block language** rides on the standard `language-*` class:
- Markdown: ``` ```python ``` both directions.
- HTML: exports `<code class="language-python">`; the importer reads `language-*` **or** `lang-*`, so code from other highlighters keeps its language. No class → `plain`.
- Anything not matching `[a-z0-9+#-]` is stripped on export.

**Tracked changes in exports:** pending suggestions are rendered as literal `[-old-][+new+]` marks (via the private `blocksWithTrackedMarks`) so an export never silently ships the accepted-only text. There are **no Word `w:ins`/`w:del` revisions** — see GAP 3.

---

## Limits (honest, current at `45a2a08`)

| Limit | Impact | Fix path |
|---|---|---|
| Host cannot control suggesting mode | Can't mount in review mode or lock a role | Add `mode`/`defaultMode`/`onModeChange` props (~10 lines) — **esign GAP 1** |
| No exported headless "apply accepted changes" | Server can't compute the final document | Export the already-pure `foldChange` as `applySuggestions()` — **esign GAP 2** |
| DOCX has no native tracked-change revisions | Word shows bracket text, not redlines | Export `blocksWithTrackedMarks` (trivial) and/or emit `w:ins`/`w:del` OOXML (real work) — **esign GAP 3** |
| Suggesting tracks text edits only | Adding/removing/retyping a block commits directly, untracked | Structural tracking needs a block-level change type |
| One active change per block per pass | Two separate edits in one block merge into the spanning region | Multi-region requires a change list per block + anchor maintenance |
| IME/composition not intercepted | CJK input materialises on blur, not mid-keystroke | Handle `compositionstart/update/end` and reconcile |
| Inline page link shows a generic doc glyph | Not the page's real icon, unlike tree/menu/block | Needs a resolver + `serializeBlock` exclusion — **deliberately declined**, see Traps |
| `todo`/`callout`/`code` flatten through DOCX | Contract fidelity when round-tripping through Word | Map to Word list/shading constructs in `editor-io.ts` |
| Full-text search is a linear scan | Fine to hundreds of pages | Build an index in `page-store.ts` |
| Tree drag-to-move logic asserted, HTML5 row-DnD not driven in-harness **[verify]** | Possible DnD edge cases | Drive native DnD in a harness pass |

---

## Verifying a change here

There is no unit-test suite in this lane; verification is a live harness (`_preview/`, not shipped). It has views for each condition that has previously hidden a bug:
- **App-mount (unbounded)** — a parent that grows to content, which is what hid the scroll-container bug a fixed-pixel harness could not show.
- **Suggesting** — a seeded pending change plus live typing.
- **Composability** — the preset spectrum with live toggles.
- **Record richText (regression)** — the bare `NotionEditor` as a record field. **Run this after any change to `serializeBlock`, `changesFor`, `buildBlockHtml`, or the `InlineChange` shape.**

Minimum bar before pushing: `tsc --noEmit` clean for `blocks/document` + `record-core`, both themes checked, and the record-field regression view still rendering its tracked change and serialising to the original.
