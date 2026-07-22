# Recipes

Task-shaped recipes for the record-core. Each one is config first: the library ships the
model and the views, the consumer ships an `ObjectConfig` and the store callbacks.

## Ship a task tracker

`taskObjectConfig()` returns a ready task `ObjectConfig` — every part overridable, the field
KEYS held stable (`TASK_KEYS`) so the task-aware views resolve their defaults without config:

```ts
import { taskObjectConfig, seedTasks, SEED_TASK_USERS, SEED_TASK_LABELS } from "@nexus/ui";

const tasks = taskObjectConfig({
  labels: SEED_TASK_LABELS,
  statuses: [
    { value: "Backlog", color: "gray" },
    { value: "Doing", color: "yellow" },
    { value: "Shipped", color: "green" },   // matched as "done" by name
  ],
});
```

The shape it declares: `title` `status` `assignee` `priority` `labels` `startDate` `dueDate`
`estimate` (hours) `timeSpent` `progress` `repeat` `description`, plus four structural fields:

| Field | Type | What it carries |
|---|---|---|
| `parent` | self-relation | **subtasks** — a flat store, the tree is derived |
| `blockedBy` | multiple self-relation | **dependencies** — "is blocked by" ids |
| `timeEntries` | json | the time log (`TimeEntry[]`; a running entry has `end: null`) |
| `plannedFor` + `focusOrder` | date + number | the **day plan** the Today view orders |

Subtasks and dependencies are ordinary relations, so nothing forks the record store: tables,
boards and calendars render the same rows unchanged. The tree is derived on read
(`buildTaskTree` → `flattenTree`), which is why a filtered-out parent never hides its
children — an orphan surfaces as a root rather than disappearing.

Which statuses count as "complete" is derived from their NAMES
(`done|complete|shipped|closed|cancel`) unless you say otherwise — pass `doneStatuses`, or set
`doneStatuses` on a view's config, and the derivation steps aside.

## Add the Timeline (Gantt) view

```ts
views: [{ type: "timeline" }]
```

Bars run start→due on a time axis with the subtask tree in the left rail: dependency arrows,
drag-to-reschedule (whole days; edge handles resize, and a resize may not invert the bar),
day/week/month/quarter zoom, a today marker, weekend shading, overdue / at-risk / blocked
styling, and critical-path emphasis (the longest chain by duration through the incomplete
dependency DAG). A due-only task renders as a milestone diamond; an undated one parks in the
rail with no bar rather than being dropped.

Every config key is optional — defaults resolve from `TASK_KEYS`, then from the object's own
fields — so the view works on a non-task object by naming its fields:

```ts
{ type: "timeline", startDateField: "kickoff", dueDateField: "deadline",
  parentField: "epic", dependenciesField: "waitsOn", defaultZoom: "month",
  criticalPath: false }
```

View-state keys in the bag: `tlZoom` · `tlCollapsed` · `tlAssignee`.

On mobile the rail narrows to titles + carets and the zoom drops to month, so the whole plan
stays legible instead of becoming a horizontal scroll maze.

## Add the Today (focus) view

```ts
views: [{ type: "focus", newTaskStatus: "Todo" }]
```

The day surface, deliberately not another backlog: an ordered day plan with per-task timers on
the left, and the pull-in pane (overdue / due-soon suggestions, then the backlog) on the right.
Two rules give it meaning:

- **Planning is explicit.** A due date never drafts work into your day — it only *suggests*.
  Pulling a task in writes `plannedFor` + `focusOrder`; nothing else moves.
- **One timer runs at a time.** Starting a timer emits the stop patch for whatever was running,
  so the switch lands as one coherent pass rather than two racing writes.

Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>t</kbd> timer · <kbd>x</kbd> done ·
<kbd>[</kbd>/<kbd>]</kbd> reorder · <kbd>⌫</kbd> remove from the day · <kbd>Enter</kbd> open.
Quick-add takes a title and creates the task already planned for the day. The day stepper plans
tomorrow tonight. `focusUser` scopes to one person ("My tasks").

View-state keys: `focusDate` · `focusUser` · `focusPane` (mobile's Today|Add switch).

`newTaskStatus` exists because the first non-done status is the wrong default on a workflow
that opens with a holding state — a task you just committed to today should not land in
"Backlog".

## Track time

The log lives on the row (`timeEntries`), not in a side store, and elapsed time is DERIVED from
it — so a reload, or a closed laptop, neither loses nor double-counts a running stretch. There
is no background ticker.

```ts
import { toggleTimerPatches, timeBudget, formatDuration, logTimePatch } from "@nexus/ui";

// the host applies every returned patch — a switch is two of them
toggleTimerPatches(rows, id).forEach(({ id, patch }) => onPatch(id, patch));

const { spentSeconds, ratio, over } = timeBudget(row);   // vs `estimate`, in hours
logTimePatch(row, 30 * 60);                              // "I forgot to start the timer"
```

`trackedSecondsOn(row, day)` attributes a session to the day it STARTED — the simple rule a
user can predict when a stretch crosses midnight. `dayLoad` rolls the plan up for the header;
`sessionSeconds` is the current stretch (what the running banner reads), distinct from the
task total (what the row reads).

Completing a repeating task rolls it to its next occurrence via `rollRecurrencePatch` — which
also clears the day plan and the time log, because the next occurrence is not the one you just
finished and must not sit in Today looking untouched.

## Wire an issue provider (GitHub, Jira)

`taskSync.ts` is a **seam, not an integration**: it performs no network I/O. You bring the
authenticated call, its pagination and its rate-limit policy; the module owns the two things
you cannot guess — the payload SHAPE and the MAPPING onto a task row.

```ts
import { syncIssues, linkIssues, GITHUB_MAPPING } from "@nexus/ui";

const issues = (await gh.listIssues(...)).map(GITHUB_MAPPING);
const { creates, updates, orphans } = syncIssues(rows, issues, {
  statusMap: { open: "Todo", closed: "Done" },
});
await Promise.all(creates.map(create));
updates.forEach(({ id, patch }) => onPatch(id, patch));
// second pass: provider links reference EXTERNAL ids, which only resolve once rows exist
linkIssues(await reload(), issues).forEach(({ id, patch }) => onPatch(id, patch));
```

The diff is conservative on purpose:

- an **unmapped provider state leaves the local status alone** rather than guessing a column;
- **`localOnly` fields are never overwritten** — by default the day plan and the time log, because
  a provider has no opinion about your day;
- a local row whose `externalId` is absent from the payload is returned as an **orphan**, surfaced
  for the caller to decide, never auto-deleted;
- only CHANGED fields enter a patch, so a sync that finds nothing writes nothing.

`GITHUB_MAPPING` and `JIRA_MAPPING` are written against the documented REST shapes (Jira's
`timeoriginalestimate` is seconds; a GitHub issue has no native due date, so the milestone's
`due_on` is used). Field availability varies with plan, custom fields and expansions — verify
against a real payload from your instance before relying on an optional field.

`mockIssues` is **explicitly labelled demo data** (`MOCK_NOTICE`) so a surface can say so
rather than implying a connected account.

## Saved views and filters

Task views do not filter — the host does, and the views receive rows already searched and
filtered (the `ViewProps` contract). So saved views need no task-specific machinery: persist
`{ filters, search, viewType, viewState }` and re-apply it. Because the view-state bag is
captured too, a saved view restores the zoom you left the timeline on, or the person the Today
view was scoped to.
# RECIPES — the page workspace & document surface
A Notion×Google-Docs **linked page workspace**: everything is a page, pages nest and reference each other, and each page is a block-rich document portable to Word. Three entry points, largest first:
- **`PageWorkspace`** (`src/blocks/document`) — the whole workspace: a page-tree sidebar + breadcrumbs + Cmd-K quick-switcher + backlinks, hosting a document per page. Free-surface (host owns the whole `PageStore`). **This is what a Pages host mounts for a `kind:"document"` page.**
- **`DocumentSurface`** (`src/blocks/document`) — a single page: cover, icon, title, outline rail, word count, page-width toggle, find & replace, export/import menu, over the editor. `PageWorkspace` mounts one of these per page.
- **`NotionEditor`** (`src/record-core/NotionEditor`) — the bare block editor. This is the `richText` field editor; use it directly when you only want the editing canvas.
Everything is `--nx-*`-tokened (light + dark), config-composable, and mobile-by-construction.
## PageWorkspace (the page system)
```tsx
<PageWorkspace
  value={pageStore}                // PageStore | null (null seeds a nested demo workspace)
  onChange={(next) => save(next)}  // fired on every mutation — the host persists the store
  reloadNonce={n}                  // bump to force a fresh mount from `value`
  documentConfig={docConfig}       // forwarded to each page's DocumentSurface
  breadcrumbs={false}              // set false when the HOST renders its own page breadcrumb
/>
### Mounting it inside an app shell
The workspace paints **no background of its own** and renders **one** header row, so it reads
as a native surface rather than a panel dropped into the shell. Two things the host controls:
- **Breadcrumbs are mutually exclusive.** Either the host shows a breadcrumb for the page and
  you pass `breadcrumbs={false}`, or you let the workspace render the trail (recommended — it
  is tree-aware, so it shows the full root→here path for nested sub-pages, and each crumb
  navigates).
- **Give it a real height.** It fills its container (`height:100%`), so the mount point needs
  to be a flex child with `flex:1; min-height:0` (or an explicit height) — not an auto-height
  block, which collapses the internal scroll container.
What you get, out of the box: nested **sub-pages** (infinite), a **tree sidebar** (expand/collapse, drag-to-move before/after/inside, new/duplicate/delete/favorite), **breadcrumbs** (root→here), inline **sub-page blocks** (`/page` or the tree `+`), **`[[`/`@` page-link autocomplete** → clickable links, a **backlinks** panel (“linked references”, with parent/sub-page/link kinds), a **⌘K quick-switcher**, and **full-text search** across pages.
### The page store (what you persist)
interface PageNode { id; title; icon?; cover?; parentId: string | null; order: number; blocks: Block[]; favorite?; createdAt; updatedAt }
interface PageStore { version; pages: Record<id, PageNode>; activeId?; expanded?: Record<id, boolean> }
The store is a **flat adjacency list** — pages keyed by id, each pointing at its `parentId`, ordered by a **fractional `order`** key. The tree, breadcrumbs, backlinks and search are all *derived* by scanning `pages` (never stored redundantly), which makes it **external-writer-tolerant**: a concurrent writer patches one page's entry, so a merge is per-page with no structural tree conflicts. Persist the whole `PageStore` as one blob under `pageStoreKey(pageKey)`; `isPageStore(x)` guards a corrupt blob; `seedPageStore()` is the demo. Pure store ops (all node-testable) are exported: `createPage`, `duplicatePage`, `deletePage`, `movePage`, `renamePage`, `setPageBlocks`, `toggleFavorite`, `breadcrumb`, `backlinksOf`, `searchPages`, `childrenOf`, …
Links: an inline **`[[page:<id>|<title>]]`** token in block text (a clickable link, title re-resolved from the store so renames propagate) and a **sub-page block** `{ type:"page"; pageId }`. The editor renders and creates both through the `pageContext` seam — so `NotionEditor` stays entity-agnostic (a `richText` field with no `pageContext` degrades a page ref to a static chip).
> **Scale note:** the store persists as one blob, so a large workspace loads all pages + block bodies at once (fine for typical use). The flat store + `pageStoreKey` cleanly support a per-page-lazy split later (metadata in one blob; each page's `blocks` under `pageStoreKey(key)+':'+pageId`, load-on-open) paired with a maintained search/backlink index — no model change needed. See `docs/DEPENDENCIES.md`.
## DocumentSurface
```tsx
<DocumentSurface
  value={snapshot}                 // DocumentSnapshot | null (null seeds a rich demo)
  onChange={(next) => save(next)}  // fired on every edit — the host debounces
  reloadNonce={n}                  // bump to force a fresh mount from `value`
  actions={<SaveChip/>}            // optional host controls in the toolbar's right end
  readOnly={false}
  config={documentConfig}          // optional — see below
/>
### The snapshot (what you persist)
interface DocumentSnapshot {
  id: string;
  title: string;
  blocks: Block[];               // the document body — the same Block[] the richText field stores
  icon?: string;                 // a title emoji
  cover?: string;                // a preset key ("preset:dusk") or a data: URI image
  pageWidth?: "narrow" | "wide";
  version?: number;
}
Persist the whole object as one blob under an app-state key. Helpers: `documentStoreKey(pageKey)`, `isDocumentSnapshot(x)` (recover a corrupt blob to a fresh doc), `seedDocument()` (the demo). This mirrors the workbook block's snapshot contract exactly.
### DocumentConfig — every affordance is a flag (default = on)
interface DocumentConfig {
  editor?: EditorConfig;      // passed to the editor (see below)
  outline?: boolean;          // the live outline rail + its toolbar toggle
  importExport?: boolean;     // the Export/Import menu
  chrome?: boolean;           // cover + icon + title header
  cover?: boolean;            // allow a cover
  wordCount?: boolean;        // the word/char readout
  findReplace?: boolean;      // the find & replace bar
  pageWidthToggle?: boolean;  // narrow/wide toggle
}
Examples:
```tsx
// a lean note-taking surface: no cover, no page-width toggle, keep outline + export
config={{ cover: false, pageWidthToggle: false }}
// read-only published view: no import/export, no find/replace
<DocumentSurface value={doc} readOnly config={{ importExport: false, findReplace: false }} />
// restrict the block palette (e.g. a comment box — text + lists only, no toolbar)
config={{ editor: { blocks: ["p", "ul", "ol", "quote"], toolbar: false } }}
## NotionEditor (bare editor / richText field)
```tsx
<NotionEditor
  blocks={blocks}
  onChange={setBlocks}
  readOnly={false}
  config={editorConfig}          // optional
  changes={suggestions}          // optional — inline tracked-changes (the suggestions layer)
  hoveredChange={id} onHoverChange={setHover}
/>
interface EditorConfig {
  blocks?: BlockType[];          // which block types the slash menu offers (default: all)
  toolbar?: boolean;             // the inline formatting toolbar on selection (default: true)
  markdownShortcuts?: boolean;   // # / - / [] / ``` / > … (default: true)
  slashMenu?: boolean;           // "/" command menu (default: true)
}
### Blocks
`p · h1 · h2 · h3 · quote · ul · ol · todo · toggle · callout · code · divider · image · table`, each with an optional `indent` (0–5) for nesting. The model is a **flat `Block[]`** — additive over the original union, so the richText field, `useSuggestions`, and `DataTable` all keep working unchanged.
### Editing
- **Slash menu** — `/` (or the block handle's `+` on touch) inserts any block type.
- **Markdown shortcuts** — `# ` `## ` `### ` headings · `- ` `* ` bullet · `1. ` numbered · `[] ` / `[x] ` to-do · `> ` quote · `| ` callout · `` ``` `` (or `` ```ts ``) code · `--- ` divider.
- **Inline toolbar** — select text: bold / italic / underline / strikethrough / inline-code / link / highlight / text-color (9 token colors).
- **Nesting** — Tab / Shift-Tab indent; Backspace at line start outdents then merges.
- **Reorder** — drag the block handle (mouse HTML5 drag; touch pointer-drag).
- **Toggles** collapse their deeper-indented followers; **code** blocks own Enter (newline; Enter on a blank last line exits).
- **Paste** — Word / Google-Docs / web HTML is normalized to clean blocks (foreign styles stripped, structure + inline marks + nested lists preserved).
## Import / export (`src/record-core/editor-io`)
exportMarkdown(blocks, title);   // → .md download
exportHtml(blocks, title);       // → self-contained styled .html
exportPdf(blocks, title);        // → opens a print-styled window (Save as PDF)
await exportDocx(blocks, title); // → .docx (lazy-loads `docx`)
const { blocks, warnings } = await importFile(file); // .docx (lazy `mammoth`) | .html | .md/.txt
Fidelity: **Markdown** and **HTML** round-trip losslessly (HTML preserves to-do/toggle/callout + nesting). **DOCX** preserves headings, lists, tables, and all text; Word has no native to-do/callout/code-block, so those degrade to paragraphs on the round-trip (the same boundary Google Docs hits). `docxBlob(blocks, title)` returns the Blob without downloading (for tests/uploads).
## The live outline (`DocumentOutline`)
Rendered by `DocumentSurface`; use it standalone over any editor container:
```tsx
const scrollRef = useRef<HTMLElement>(null);
<div ref={scrollRef} /* the scroll container that holds the editor */>…</div>
<DocumentOutline blocks={blocks} containerRef={scrollRef} />
It derives entries from headings (h1–h3), click-scrolls, highlights the active section on scroll, and collapses — all live.
## Pages wiring (kind:"document")
`DocumentSurface` is the document twin of `WorkbookSurface`: same free-surface contract (`value` / `onChange` / `reloadNonce` / `actions`). A Pages host mounts a `kind:"document"` page by rendering `<DocumentSurface value={page.doc} onChange={persist} />` and persisting the returned `DocumentSnapshot` under `documentStoreKey(page.key)`. The surface is exported eagerly (it is light; only docx/mammoth are heavy and they are lazy), so no Suspense boundary is required.
## Composability — one surface, simple doc → full Notion
The document surface is **one composable primitive dialable across a spectrum**: from a simple Word-like document (write, suggest, accept/reject, import/export — no navigation) all the way to a full Notion workspace (nested pages, tree, backlinks, links, search) — and every coherent point between. Every structural element is an independent toggle; named **presets** mark points on the range. Pass `config` (a `WorkspaceConfig`); explicit flags override the preset, anything left `undefined` inherits it. The surface **degrades coherently** — turn the tree off and its collapse control goes with it, drop breadcrumbs and the ⌘K entry moves to the tree head; the minimal end reads as a focused document editor, not a stripped-down workspace.
```tsx
<PageWorkspace value={store} onChange={persist} config={{ preset: "doc" }} />        // a simple doc with review
<PageWorkspace value={store} onChange={persist} config={{ preset: "workspace" }} />  // the full Notion
### The preset spectrum (`config.preset`)
| Preset | Tree | Breadcrumbs | Backlinks | ⌘K | Suggestions | Use it for |
|---|---|---|---|---|---|---|
| `doc` | off | — | — | — | ✓ | a single focused document (a Word-like doc with review) |
| `review` | off | — | — | — | ✓ | a single document tuned for review — fixed width, no cover |
| `wiki` (default) | sidebar | ✓ | ✓ | ✓ | ✓ | a nested knowledge base |
| `workspace` | sidebar | ✓ | ✓ | ✓ | ✓ | the full Notion — everything on |
| `library` | **table** | ✓ | ✓ | ✓ | ✓ | browse pages as a record table, click a row to open |
| `single-doc` | off | — | — | — | ✓ | alias of `doc` (back-compat) |
**`suggestions` (track-changes) is ORTHOGONAL** — ON at every preset, so "simple doc + suggestions" and "full notion + suggestions" are each one flag; a company that wants documents without review sets `suggestions: false`.
### Element toggles (each overrides the preset)
`tree` (`"sidebar" | "off" | "table"`) · `breadcrumbs` · `backlinks` · `cmdK` · `suggestions` · `outline` · `cover` · `icons` · `export` · `wordCount` · `pageWidth` · `findReplace` — all optional booleans (except `tree`).
### Worked examples — each end of the range
```tsx
// A company that just wants documents with review (a Word replacement):
<PageWorkspace value={store} onChange={persist}
  config={{ preset: "doc" }} />              // single doc, no nav, suggesting available, import/export on
// The same, but review is the whole point — no distractions:
<PageWorkspace value={store} onChange={persist}
  config={{ preset: "review" }} />          // fixed reading width, no cover, suggesting available
// A full knowledge base with review, but the app owns the ⌘K palette:
<PageWorkspace value={store} onChange={persist}
  config={{ preset: "workspace", cmdK: false }}
  onPageIndex={(pages) => appSearch.index(pages)}    // feed the app's unified search
  onOpenPageRef={(open) => (openHandbookPage = open)} />
// Documents only, review turned OFF for a company that doesn't want it:
<PageWorkspace value={store} onChange={persist}
  config={{ preset: "doc", suggestions: false }} />
- **`tree: "table"`** renders the navigation as a record-table list (icon + title indented by depth, sub-page count, last-edited) — the same record-object idiom as the app's `DataTable`, a pure config swap with the nested tree.
- **Unified search seam** — `onPageIndex(entries: {id,title,path,icon}[])` fires whenever the page set changes; hand it to the app's "search everything" so handbook pages surface alongside records, and set `config.cmdK:false` so there is a single ⌘K palette. `onOpenPageRef(open)` gives the host a function to jump to a hit.
- The host's `breadcrumbs={false}` prop still wins over the config (used when the host renders its own trail).
- Per-page chrome flags fold into each page's `DocumentSurface` `DocumentConfig`; `documentConfig` still carries editor/chrome options untouched. Precedence: WorkspaceConfig flag > `documentConfig` flag > preset default.
## Suggesting mode — Word × Notion tracked changes
`DocumentSurface` ships a full **Editing ↔ Suggesting** review flow, composing the app's existing suggestions engine (`useSuggestions` + the tracked-change widget + `SuggestionPanel`). Toggle it off with `config.suggestions === false`.
```tsx
<DocumentSurface value={doc} onChange={persist} author={{ name: "Ada Lovelace", color: "#7c3aed" }} />
- **Mode toggle** in the toolbar. In **Suggesting** mode a block edit is captured as a tracked change (`original → replacement`, keyed to the block) instead of committing — the change **materialises on blur** as an inline `del`/`ins` widget, so typing stays caret-safe. Insertions have an empty original, deletions an empty replacement; each is **anchored to its block + offset** (not a substring search), so empty-original changes never leak into other blocks.
- **Author attribution** — the `author` prop names the reviewer; it shows on the widget (hover title) and each panel card.
- **Review panel** — pending/resolved count, **jump-to** (click a card → scroll to the change), accept/reject per change, **accept-all / reject-all**, undo, and **comments-on-change** (a note per pending change).
- **Persistence** — changes live on `DocumentSnapshot.suggestions` (and `PageNode.suggestions` in a workspace), so a review survives a reload; the accepted text lives in `blocks`, the review state alongside.
- **Export honesty** — with pending changes, every export (md/html/pdf/docx) renders them as visible marks `[-old-][+new+]` and the menu notes `N tracked changes marked`, so nothing is silently shipped.
The **record `richText` field** path (server-proposed substring substitutions, no `blockId`) is unchanged — `changesFor`/`foldChange` fall back to the original first-occurrence substring match when a change carries no `blockId`.
> v1 tracks TEXT edits within a block, one active change per block per pass; structural edits (adding/removing/retyping a block) commit directly. Resolve a block's change before re-editing that block.

## Viewer3D — a claims viewer and an architect's drawing set from one config

```tsx
// A company points the object viewer at its OWN asset (bundled/self-hosted — strict CSP):
const snapshot: Viewer3DSnapshot = {
  version: 1, kind: "viewer3d", mode: "object",
  title: `Claim ${claim.ref}`,
  object: { source: { type: "gltf", url: "/models/vehicle.glb" }, scale: 1, up: "y" },
  hotspots: claim.damages.map((d) => ({
    id: d.id, label: d.part, detail: d.assessment,
    tone: d.severity === "high" ? "danger" : "warn",
    position: d.point,
  })),
};
// OBJ from a CAD export (Z-up), imports disabled for a locked review page:
{ object: { source: { type: "obj", url: "/models/part.obj", mtlUrl: "/models/part.mtl" }, up: "z", allowImport: false } }
```

- Users can always DROP a local `.glb` / `.gltf`(+bin/textures) / `.obj`(+mtl) onto the
  stage (unless `allowImport: false`) — session-only, validated, progress-reported.
- Floorplan mode is data-driven from `levels[].rooms[].poly` + `openings[]`; add
  `roomType`/`finish`/`ceiling` per room and `floorplan.meta` for the title block and
  the surface derives the dimensions, areas, schedule, elevations and sections itself:

```tsx
{
  mode: "floorplan",
  floorplan: {
    wallThickness: 0.15,
    meta: { project: "24 Elm Street", client: "Claim #4821", sheet: "A-101", northDeg: 15 },
    levels: [{
      id: "ground", name: "Ground floor", elevation: 0, height: 2.7,
      rooms: [{ id: "living", label: "Living room", roomType: "Habitable", finish: "Oak",
                poly: [[0, 0], [5.2, 0], [5.2, 4.4], [0, 4.4]] }],
      openings: [{ id: "d1", kind: "door", edge: [[2.1, 4.4], [3.0, 4.4]], swing: 1 },
                 { id: "w1", kind: "window", edge: [[1.0, 0], [3.4, 0]], sill: 0.9, head: 2.2 }],
    }],
  },
}
```

- View state (`planView`, `units`, `activeLevel`) persists through the snapshot, so a
  page reopens on the drawing the user left. PNG export works from every view; the 2D
  plan exports at print resolution. Deep doc: `docs/viewer3d.md`.
