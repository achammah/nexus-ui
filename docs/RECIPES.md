# RECIPES — the page workspace & document surface

A Notion×Google-Docs **linked page workspace**: everything is a page, pages nest and reference each other, and each page is a block-rich document portable to Word. Three entry points, largest first:

- **`PageWorkspace`** (`src/blocks/document`) — the whole workspace: a page-tree sidebar + breadcrumbs + Cmd-K quick-switcher + backlinks, hosting a document per page. Free-surface (host owns the whole `PageStore`). **This is what a Pages host mounts for a `kind:"document"` page.**
- **`DocumentSurface`** (`src/blocks/document`) — a single page: cover, icon, title, outline rail, word count, page-width toggle, find & replace, export/import menu, over the editor. `PageWorkspace` mounts one of these per page.
- **`NotionEditor`** (`src/record-core/NotionEditor`) — the bare block editor. This is the `richText` field editor; use it directly when you only want the editing canvas.

Everything is `--nx-*`-tokened (light + dark), config-composable, and mobile-by-construction.

## PageWorkspace (the page system)

```tsx
import { PageWorkspace, type PageStore } from "@nexus/ui";

<PageWorkspace
  value={pageStore}                // PageStore | null (null seeds a nested demo workspace)
  onChange={(next) => save(next)}  // fired on every mutation — the host persists the store
  reloadNonce={n}                  // bump to force a fresh mount from `value`
  documentConfig={docConfig}       // forwarded to each page's DocumentSurface
  breadcrumbs={false}              // set false when the HOST renders its own page breadcrumb
/>
```

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

```ts
interface PageNode { id; title; icon?; cover?; parentId: string | null; order: number; blocks: Block[]; favorite?; createdAt; updatedAt }
interface PageStore { version; pages: Record<id, PageNode>; activeId?; expanded?: Record<id, boolean> }
```

The store is a **flat adjacency list** — pages keyed by id, each pointing at its `parentId`, ordered by a **fractional `order`** key. The tree, breadcrumbs, backlinks and search are all *derived* by scanning `pages` (never stored redundantly), which makes it **external-writer-tolerant**: a concurrent writer patches one page's entry, so a merge is per-page with no structural tree conflicts. Persist the whole `PageStore` as one blob under `pageStoreKey(pageKey)`; `isPageStore(x)` guards a corrupt blob; `seedPageStore()` is the demo. Pure store ops (all node-testable) are exported: `createPage`, `duplicatePage`, `deletePage`, `movePage`, `renamePage`, `setPageBlocks`, `toggleFavorite`, `breadcrumb`, `backlinksOf`, `searchPages`, `childrenOf`, …

Links: an inline **`[[page:<id>|<title>]]`** token in block text (a clickable link, title re-resolved from the store so renames propagate) and a **sub-page block** `{ type:"page"; pageId }`. The editor renders and creates both through the `pageContext` seam — so `NotionEditor` stays entity-agnostic (a `richText` field with no `pageContext` degrades a page ref to a static chip).

> **Scale note:** the store persists as one blob, so a large workspace loads all pages + block bodies at once (fine for typical use). The flat store + `pageStoreKey` cleanly support a per-page-lazy split later (metadata in one blob; each page's `blocks` under `pageStoreKey(key)+':'+pageId`, load-on-open) paired with a maintained search/backlink index — no model change needed. See `docs/DEPENDENCIES.md`.

## DocumentSurface

```tsx
import { DocumentSurface, type DocumentSnapshot } from "@nexus/ui";

<DocumentSurface
  value={snapshot}                 // DocumentSnapshot | null (null seeds a rich demo)
  onChange={(next) => save(next)}  // fired on every edit — the host debounces
  reloadNonce={n}                  // bump to force a fresh mount from `value`
  actions={<SaveChip/>}            // optional host controls in the toolbar's right end
  readOnly={false}
  config={documentConfig}          // optional — see below
/>
```

### The snapshot (what you persist)

```ts
interface DocumentSnapshot {
  id: string;
  title: string;
  blocks: Block[];               // the document body — the same Block[] the richText field stores
  icon?: string;                 // a title emoji
  cover?: string;                // a preset key ("preset:dusk") or a data: URI image
  pageWidth?: "narrow" | "wide";
  version?: number;
}
```

Persist the whole object as one blob under an app-state key. Helpers: `documentStoreKey(pageKey)`, `isDocumentSnapshot(x)` (recover a corrupt blob to a fresh doc), `seedDocument()` (the demo). This mirrors the workbook block's snapshot contract exactly.

### DocumentConfig — every affordance is a flag (default = on)

```ts
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
```

Examples:

```tsx
// a lean note-taking surface: no cover, no page-width toggle, keep outline + export
config={{ cover: false, pageWidthToggle: false }}

// read-only published view: no import/export, no find/replace
<DocumentSurface value={doc} readOnly config={{ importExport: false, findReplace: false }} />

// restrict the block palette (e.g. a comment box — text + lists only, no toolbar)
config={{ editor: { blocks: ["p", "ul", "ol", "quote"], toolbar: false } }}
```

## NotionEditor (bare editor / richText field)

```tsx
import { NotionEditor, type Block, type EditorConfig } from "@nexus/ui";

<NotionEditor
  blocks={blocks}
  onChange={setBlocks}
  readOnly={false}
  config={editorConfig}          // optional
  changes={suggestions}          // optional — inline tracked-changes (the suggestions layer)
  hoveredChange={id} onHoverChange={setHover}
/>
```

```ts
interface EditorConfig {
  blocks?: BlockType[];          // which block types the slash menu offers (default: all)
  toolbar?: boolean;             // the inline formatting toolbar on selection (default: true)
  markdownShortcuts?: boolean;   // # / - / [] / ``` / > … (default: true)
  slashMenu?: boolean;           // "/" command menu (default: true)
}
```

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

```ts
import { exportMarkdown, exportHtml, exportPdf, exportDocx, importFile } from "@nexus/ui";

exportMarkdown(blocks, title);   // → .md download
exportHtml(blocks, title);       // → self-contained styled .html
exportPdf(blocks, title);        // → opens a print-styled window (Save as PDF)
await exportDocx(blocks, title); // → .docx (lazy-loads `docx`)

const { blocks, warnings } = await importFile(file); // .docx (lazy `mammoth`) | .html | .md/.txt
```

Fidelity: **Markdown** and **HTML** round-trip losslessly (HTML preserves to-do/toggle/callout + nesting). **DOCX** preserves headings, lists, tables, and all text; Word has no native to-do/callout/code-block, so those degrade to paragraphs on the round-trip (the same boundary Google Docs hits). `docxBlob(blocks, title)` returns the Blob without downloading (for tests/uploads).

## The live outline (`DocumentOutline`)

Rendered by `DocumentSurface`; use it standalone over any editor container:

```tsx
import { DocumentOutline } from "@nexus/ui";
const scrollRef = useRef<HTMLElement>(null);
<div ref={scrollRef} /* the scroll container that holds the editor */>…</div>
<DocumentOutline blocks={blocks} containerRef={scrollRef} />
```

It derives entries from headings (h1–h3), click-scrolls, highlights the active section on scroll, and collapses — all live.

## Pages wiring (kind:"document")

`DocumentSurface` is the document twin of `WorkbookSurface`: same free-surface contract (`value` / `onChange` / `reloadNonce` / `actions`). A Pages host mounts a `kind:"document"` page by rendering `<DocumentSurface value={page.doc} onChange={persist} />` and persisting the returned `DocumentSnapshot` under `documentStoreKey(page.key)`. The surface is exported eagerly (it is light; only docx/mammoth are heavy and they are lazy), so no Suspense boundary is required.
