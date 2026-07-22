#!/usr/bin/env node
/* Generate the component catalog — docs/INDEX.md (human) + docs/catalog.json (machine).
   Run after every vendor/wrapper change: the catalog is DERIVED from the live tree
   (.vendor-manifest.json + the source files), so it cannot rot. The WHEN one-liners
   are curated here — this dictionary IS the documentation surface agents grep. */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(ROOT, "src");
const DOCS = path.join(ROOT, "docs");
mkdirSync(DOCS, { recursive: true });

/* WHEN-to-use, per vendored component (curated; extend when vendoring new items). */
const WHEN = {
  accordion: "collapsible Q&A / grouped detail sections; one or many open",
  alert: "inline callout (info/destructive) inside a page — not a toast, not a dialog",
  "alert-dialog": "REVIEW SURFACE before an irreversible action (delete/send) — names the target, confirm/cancel; required before any bulk mutation",
  "aspect-ratio": "media/embed boxes that must keep a ratio while resizing",
  avatar: "person/org identity dot with image + initials fallback",
  badge: "status chip; prefer the primitives Badge wrapper for Nexus tones (ok/warn/danger/accent)",
  breadcrumb: "hierarchical location trail (Settings / Team / Member)",
  button: "every action; prefer the primitives Button wrapper (variant/size/busy/icon API)",
  calendar: "date picking (react-day-picker); pairs with popover for a date-picker field",
  card: "raised content container with header/footer slots; .nxCard is the lighter token twin",
  carousel: "horizontally swiped media/item strip (embla)",
  chart: "recharts wrapper bound to the token palette (--chart-1..5); dashboards + trend blocks",
  checkbox: "boolean field / row selection; wrapper Checkbox gives the simple checked/onChange API",
  collapsible: "show-more region without accordion semantics",
  command: "typeahead lists + the ⌘K palette (cmdk); the starter wires CommandPalette on it",
  "context-menu": "right-click menus on rows/cards",
  dialog: "modal for a focused task (create/edit form); wrapper Dialog gives title/footer API",
  drawer: "bottom sheet on mobile-ish flows (vaul)",
  "dropdown-menu": "kebab/row action menus; wrapper Menu gives trigger+items API",
  form: "react-hook-form + zod field wiring (FormField/FormItem/FormMessage) for validated forms",
  "hover-card": "rich preview on hover (person card over a mention)",
  input: "single-line text entry; wrapper Input adds invalid→aria-invalid",
  "input-otp": "segmented one-time-code entry",
  label: "accessible field labels tied to inputs",
  menubar: "app-level horizontal menu (File/Edit style)",
  "navigation-menu": "marketing/site-style top navigation with panels",
  pagination: "page-by-page navigation for long lists (record-core tables usually filter instead)",
  popover: "small anchored panel (filter builder, emoji picker); not a menu, not a dialog",
  progress: "determinate progress bar; pair with async-run surfaces",
  "radio-group": "single choice among few visible options",
  resizable: "split panes with draggable handles (react-resizable-panels)",
  "scroll-area": "styled scroll container for bounded internal scroll",
  select: "single choice among many options (composed listbox); raw <select class=nxInput> stays fine for tiny enum cells",
  separator: "hairline divider",
  sheet: "side panel over content (record peek, filters) — the ZOOM step without leaving the list",
  sidebar: "full app-shell sidebar system (collapsible groups, mobile behavior); the starter shell is a lighter hand-rolled twin — adopt this when an app outgrows it",
  skeleton: "loading placeholders shaped like the content",
  slider: "numeric range input",
  sonner: "toast system (Toaster + toast()); the starter ships its own minimal toast — pick ONE per app",
  switch: "on/off setting with immediate effect",
  table: "styled table primitives; record-core DataTable is the batteries-included grid on top",
  tabs: "in-page view switching; wrapper Tabs gives the {tabs,value,onValueChange} API",
  textarea: "multi-line text entry",
  toggle: "pressed/unpressed tool button",
  "toggle-group": "exclusive or multi toggle row (view switches)",
  tooltip: "hover hint; wrapper Tip gives label+child API",
  "use-mobile": "hook: viewport-below-768 boolean (sidebar dependency)",
  field: "labeled field scaffolding (Field/FieldGroup/FieldLabel…) used by newer blocks; form.tsx remains the react-hook-form wiring",
};

const BLOCK_WHEN = {
  "login-03": "copy-out starting screen: card login with provider slots — richer than the starter's built-in gate",
  "sidebar-07": "copy-out starting shell: collapsible sidebar app frame (breadcrumb header, icon rail) — adopt when an app outgrows the starter's hand-rolled shell",
};

const OURS = [
  ["primitives/Button.tsx", "wrapper", "Button", "the house button API (variant primary/secondary/ghost/danger · size sm/md · busy · icon) over vendored button"],
  ["primitives/fields.tsx", "wrapper", "Input · Badge · Micro · Tabs/TabPanel · Checkbox · Tip", "house APIs over vendored input/badge/tabs/checkbox/tooltip + the Micro eyebrow"],
  ["primitives/overlays.tsx", "wrapper", "Dialog · Menu", "house APIs over vendored dialog/dropdown-menu (title+footer / trigger+items)"],
  ["primitives/SettingsTabs.tsx", "wrapper", "SettingsTabs", "generic settings shell: sticky tab bar (tabs-as-config: key/label/icon/render) + body, own active-tab state — page head stays app content"],
  ["primitives/EditableRuleList.tsx", "wrapper", "EditableRuleList", "config-driven editable rule/policy list: inline add/edit card, optional severity chip (enum+colors as props) and active toggle, over any object — no fetch inside, onCreate/onPatch/onRemove callback contract like DataTable"],
  ["primitives/ThinkingDots.tsx", "wrapper", "ThinkingDots", "the 'AI is working' indicator (three bouncing accent dots); tokenized + reduced-motion aware — drop in beside any agent/task-run affordance"],
  ["primitives/Markdown.tsx", "wrapper", "Markdown · renderMarkdown", "dependency-free Markdown → React renderer (inline bold/italic/code + block headings/lists/quotes/fenced code/tables/rules); tokenized in markdown.css — for agent replies and short rich text"],
  ["record-core/DataTable.tsx", "record-core", "DataTable", "config-driven grid: sort, selection, inline edit, relation link cells, numeric alignment — see docs/record-core.md"],
  ["record-core/KanbanBoard.tsx", "record-core", "KanbanBoard", "config-driven board over the object's stageField; drag or stage-select moves cards"],
  ["record-core/RecordPage.tsx", "record-core", "RecordPage", "record anatomy: header + fields panel (inline edit, enrich affordance) + Timeline (activity composer, per-kind icons) / Notes / Files tabs"],
  ["record-core/NotionEditor.tsx", "record-core", "NotionEditor · textToBlocks · markdownToBlocks · htmlToBlocks · blocksToMarkdown · highlightCode", "Notion×Google-Docs block editor for the richText field type AND the document surface: contenteditable blocks (p/h1-3/quote/list/divider/image/table + to-do/toggle/callout/code + nested lists via a flat indent level), a slash command menu, block drag-reorder (mouse + touch), an inline formatting toolbar on selection (bold/italic/underline/strike/code/link/highlight/color), markdown shortcuts (# ▸ - [] ``` …), a dependency-free code highlighter, and Word/Google-Docs PASTE normalization (clipboard HTML → clean blocks, foreign styles stripped); config-composable (EditorConfig: which blocks/toolbar/shortcuts/slash), controlled (blocks/onChange) + inline-change props for the suggestions layer. Additive over the original Block union — every existing consumer keeps working"],
  ["record-core/useSuggestions.ts", "record-core", "useSuggestions · Suggestion", "the accept/reject/undo engine for inline tracked changes over a Block[] document: folds an accepted change's original into replacement in the doc, tracks each change's status; entity-agnostic (no object/api coupling), pairs with SuggestionPanel + NotionEditor's inline-change props"],
  ["record-core/DocumentOutline.tsx", "record-core", "DocumentOutline · outlineFromBlocks", "a live table-of-contents derived from a document's headings (h1-3): click-to-scroll, active-section highlight tracked on scroll, collapsible, updates live as you edit; reads block rows by data-testid inside a passed scroll container, so it needs no editor coupling"],
  ["record-core/editor-io.ts", "record-core", "blocksToHtml · inlineToHtml · exportMarkdown · exportHtml · exportPdf · exportDocx · docxBlob · importFile", "import/export for the block model — all client-side, CSP-safe, MIT/permissive: export to Markdown, self-contained HTML, print-to-PDF, and Word .docx (lazy `docx`); import .docx (lazy `mammoth` → HTML → blocks), .html, and markdown. The heavy libs load ONLY on export/import, never in the base bundle"],
  ["record-core/SuggestionPanel.tsx", "record-core", "SuggestionPanel", "the review rail for inline tracked changes: one card per change (del to ins diff + reason), accept/reject on pending + undo on resolved, bulk accept-all/reject-all, progress; pure presentational, wired to the useSuggestions callbacks"],
  ["record-core/Pipeline.tsx", "record-core", "Pipeline · Chip", "generic horizontal state indicator over a config-declared set of states (done/current/in-progress steps) plus the Chip status pill it is built from; states are plain strings the caller supplies"],
  ["record-core/Filters.tsx", "record-core", "FilterBar · FilterChips · matchFilters · opsFor · filterableFields", "advanced filtering: command-style filter builder (any column, type-aware operators) + removable active-filter chips + a pure matchFilters(row,conds) predicate; filterableFields(fields) maps an object's fields to the filterable set"],
  ["record-core/ChartView.tsx", "record-core", "ChartView", "config-driven chart: one bar per group option, Count or Σ numeric measure — the third view family beside table/board"],
  ["record-core/views/types.ts", "record-core", "ViewDefinition · ViewProps · ViewInstanceConfig", "the view-type contract: what a views/<type>/definition.tsx default-exports (label/icon/component/toolbar/config schema) and the props every view receives from its host"],
  ["record-core/views/registry.ts", "record-core", "viewDefinitions · getViewDefinition", "build-time self-registering view registry (import.meta.glob over views/*/definition) — drop a folder = a new view type in every consumer's switcher, zero switcher edits"],
  ["record-core/views/resolve.ts", "record-core", "buildRegistry · configuredViewsFor", "the registry's pure core (no browser, no vite — node-testable): fold glob modules into the type map; derive an object's view tabs (declared `views` or the legacy table/board/chart set)"],
  ["record-core/views/group.ts", "record-core", "groupableFields · measurableFields · resolveGroupBy", "shared grouping derivations for board/chart views and their host: which fields can group, which can measure, and the groupBy fallback chain (runtime pick → instance config → stageField → first groupable)"],
  ["record-core/views/controls.tsx", "record-core", "GroupByMenu", "the shared group-by picker rendered by both board and chart toolbars (same viewState.groupBy — regroup one, the other follows)"],
  ["record-core/views/table/definition.tsx", "record-core", "table view definition", "the built-in table view: DataTable behind the ViewProps contract + the Columns visibility menu as its toolbar"],
  ["record-core/views/gallery/definition.tsx", "record-core", "gallery view definition", "the built-in gallery view: cover-card masonry (coverField/titleField/metaFields/cardSize config) — cards open the peek; lazy component"],
  ["record-core/views/gallery/pack.ts", "record-core", "packColumns · visibleIndices · cardHeight · columnCountForWidth", "the gallery's pure masonry math (node-testable): deterministic shortest-column packing over exact card heights + viewport windowing"],
  ["record-core/views/form/definition.tsx", "record-core", "form view definition", "the built-in form view: config-driven fill-one-record intake (fields/requiredOverrides/submitLabel/successMode) submitting through ViewProps.onCreate; lazy component"],
  ["record-core/fields/draft.ts", "record-core", "coerceDraft · validateDraft · withStageDefault · requiredKeys · coerceScalar · listValidators · formSupported", "the draft pure core every create surface shares (dialog, wizard, form): typed-string coercion, config-implied validation mirroring the server, stage defaulting; registered field types plug their coerce/validate slots into the same pipeline"],
  ["record-core/fields/editors.tsx", "record-core", "Draft* editors · MoneyField · ListField · AddressField · FullNameField · MultiSelectField · ArrayField · DateField", "the per-type field editors: draft-mode controlled editors for every built-in type plus the shaped record-page editors (moved here from RecordPage, which re-exports them)"],
  ["record-core/fields/draft-resolve.ts", "record-core", "fieldDraftEditor", "host-side draft-editor lookup over the field-type registry, text-editor fallback for unregistered types"],
  ["record-core/fields/text/definition.ts", "record-core", "built-in field-type definitions (22 folders)", "one fields/<type>/definition.ts per built-in type registering its Draft editor on the field-type registry — the pattern a NEW field type copies"],
  ["record-core/views/kanban/definition.tsx", "record-core", "kanban view definition", "the built-in board view: KanbanBoard behind the ViewProps contract + group-by and per-column rollup pickers as its toolbar"],
  ["record-core/views/chart/definition.tsx", "record-core", "chart view definition", "the built-in chart view: ChartView behind the ViewProps contract + measure and group-by pickers as its toolbar"],
  ["record-core/views/grid/definition.tsx", "record-core", "grid view definition", "the Sheet view: Excel-grade bulk editing over an object's records (glide-data-grid) — fill-handle, range select, TSV copy/paste, keyboard cell-nav, frozen primary column; the component ships as a lazy chunk"],
  ["record-core/views/grid/SpreadsheetView.tsx", "record-core", "SpreadsheetView", "the grid view surface: columns from the object's fields, native + custom (select/multiselect/user chip) cells, every commit one merged onPatch per touched row, paste/fill coerced per target field, row markers synced to the host bulk bar"],
  ["record-core/views/grid/cells.ts", "record-core", "cellDescFor · isGridEditable · coerceFromText · textForCopy", "the grid's pure cell-mapping core (no glide, no browser — node-testable): field type → cell kind, the editable set, paste/fill text coercion that rejects impossible values"],
  ["record-core/views/grid/contrast.ts", "record-core", "deriveSelectionText · relLuminance · contrastRatio", "the grid's pure selection-contrast core (no glide, no browser — node-testable): when a skin or theme leaves the selection background too close to the base ink, derive the flipped text ramp (WCAG luminance, white/black pole) that SpreadsheetView applies as a per-cell themeOverride on selected cells"],
  ["record-core/views/grid/theme.ts", "record-core", "useGridTheme · deriveGridTheme · deriveSelectionText · chipColorLiterals · resolveCssColor", "token → glide Theme derivation for canvas paint: probe-resolved --nx-* literals, chip colors from the exact chipStyle color-mix formula, and the selected-cell contrast text ramp — all re-derived on dark-mode flip and skin arrival"],
  ["record-core/views/grid/renderers.tsx", "record-core", "selectRenderer · multiselectRenderer · userRenderer", "custom canvas cells for select/multiselect/user: chip and avatar drawing from pre-resolved literals + DOM overlay editors sharing the DOM chip styling"],
  ["record-core/views/grid/editors.tsx", "record-core", "provideGridEditor", "replacement overlay editors for glide's built-in text/uri/number cells: commit from local state via onFinishedEditing (the library's own commit chain drops values under React 18 StrictMode), guarded blur-commit for click-away"],
  ["record-core/views/flow/definition.tsx", "record-core", "flow view definition", "the flow (node-graph) view registry entry: records-as-graph config (relationField/labelField), plain-language validation, and the relation-picker toolbar; the canvas loads as a lazy chunk"],
  ["record-core/views/flow/FlowView.tsx", "record-core", "FlowView", "the records-as-graph canvas (lazy): record cards + cross-object hub chips as xyflow nodes, one configured relation as edges, pan/zoom/minimap/drag-arrange with per-relation drag positions persisted in the view-state bag"],
  ["record-core/views/flow/graph.ts", "record-core", "buildGraph · resolveRelation · resolveLabelField · positionsFor · positionsPatch", "the flow view's pure core (node-testable, JSX-free): relation resolution, node/edge derivation from the _refs id decoration (self-relation record edges, cross-object/polymorphic hubs), drag-position persistence shapes"],
  ["record-core/views/flow/layout.ts", "record-core", "layoutGraph · bfsGrid", "flow auto-layout: dagre TB up to 2,000 nodes, an O(V+E) BFS-rank grid above it — imported only by the lazy canvas chunk so dagre stays out of the eager bundle"],
  ["record-core/views/calendar/definition.tsx", "record-core", "calendar view definition", "the calendar view (FullCalendar month/week, lazy chunk): drag-to-reschedule PATCHes the record's date field, empty-day click seeds a prefilled create, event colors come from the colorField's own select-option palette; Month/Week toggle as its toolbar; mobile swaps the grid for a virtualized agenda list"],
  ["record-core/views/calendar/events.ts", "record-core", "rowsToEvents · patchForDrop · patchForResize · firstDateField", "pure record→event mapping for the calendar view (node-testable): date vs dateTime semantics, inclusive⇄exclusive span-end conversion, malformed-data normalization, agenda day grouping"],
  ["record-core/views/map/definition.tsx", "record-core", "map view definition", "the map view: records with lat/lng as token pins (≤25) or GL clusters, record-card popups into the peek, a without-location count chip; config latField/lngField/titleField/colorField — the heavy component is a lazy chunk, maplibre loads only when a map renders"],
  ["record-core/views/map/geo.ts", "record-core", "CLUSTER_THRESHOLD · inferCoordFields · splitRows · toFeatureCollection · boundsOf · mapDefaultConfig · mapValidateConfig", "the map view's pure geo core (no browser — node-testable): coordinate inference + validity (0 is a valid coordinate), the located/without split, GeoJSON + bounds math, config default/validate"],
  ["record-core/RecordCard.tsx", "record-core", "RecordCard", "shared compact record card (title + meta values over formatCell/OptionChip) for record-as-card surfaces — map popups, gallery tiles; chrome-less, the host provides the card shell"],
  ["record-core/types.ts", "record-core", "ObjectConfig · FieldDef · RecordRow · ViewDef · TimelineEvent · FileMeta", "the config-driven object model — the schema every record surface renders from"],
  ["record-core/fields/types.ts", "record-core", "FieldTypeDefinition · FieldRenderProps · FieldCellProps · FieldDraftProps", "the field-type contract: what a fields/<type>/definition.tsx default-exports — record-page render, list cell, previewText, layout/filterable/keyboard capabilities, plus the Draft/coerce/validate editor slots"],
  ["record-core/fields/registry.ts", "record-core", "fieldTypeDefinitions · getFieldTypeDefinition · fieldPreviewText · fieldIsBlock", "build-time self-registering field-type registry (import.meta.glob over fields/*/definition) — hosts consult it BEFORE their built-in switches, so a new field type is a dropped folder, zero switch edits"],
  ["record-core/fields/resolve.ts", "record-core", "buildFieldRegistry · registry capability helpers", "the field registry's pure core (no browser, no vite — node-testable): fold glob modules into the type map + one-line capability reads that tolerate unregistered types"],
  ["record-core/fields/whiteboard/definition.tsx", "record-core", "whiteboard field type", "a per-record excalidraw canvas as a FIELD: lazy full editor on the record page (debounced one-patch saves, theme-follow, mobile tap-to-edit overlay), memoized theme-aware SVG thumbnails in cells, scene JSON through the normal store path"],
  ["blocks/wizard/Wizard.tsx", "wrapper", "Wizard", "config-driven guided flow: question set (kinds select/text/long/list/sources) → step engine with progress + slide anim → onComplete; a guided-vs-blank landing; host supplies questions + callbacks"],
  ["blocks/wizard/ModalOverlay.tsx", "wrapper", "ModalOverlay", "lightweight centered overlay shell (backdrop + escape/close) for a full-page-or-popup wizard"],
  ["blocks/wizard/ChipListInput.tsx", "wrapper", "ChipListInput", "chip composer: type + enter to add removable tag chips — the list-kind wizard input, reusable standalone"],
  ["blocks/wizard/SourcesInput.tsx", "wrapper", "SourcesInput", "URL list + file-pick source composer (readFile overridable) — the sources-kind wizard input"],
  ["blocks/copilot/CopilotPanel.tsx", "wrapper", "CopilotPanel · CopilotToggle", "docked AI copilot side-panel: conversation state + Markdown replies + tool-use chips (host injects the transport + per-turn context), plus the toggle button; config-driven (title/mark/emptyStateCopy/suggestions)"],
  ["blocks/mobile/ShortcutsOverlay.tsx", "wrapper", "ShortcutsOverlay", "keyboard-shortcuts help modal (host toggles it, typically on `?`): host passes shortcut GROUPS — a core shell group vs an app/config-driven group — the overlay renders the reference and claims Escape/? in capture while open; pairs with the starter's keyboard-nav layer"],
  ["blocks/mobile/MobileReviewBanner.tsx", "wrapper", "MobileReviewBanner", "generic phone bottom step-through: prev / index-of-total / next over a set of N items plus per-item action buttons (accept/reject/default tones); pure presentation, fixed above a bottom tab bar (--nx-mobilenav-h), hidden on desktop — e.g. stepping a record set or suggestions on mobile"],
  ["blocks/workbook/WorkbookSurface.tsx", "wrapper", "WorkbookSurface · LazyWorkbookSurface", "full spreadsheet workbook (Univer) rendered as a NATIVE page surface: formula bar + 400+ functions, insert/delete rows & columns, cell formatting, multiple sheets, freeze + merge, in a single-row toolbar (ribbonType simple, overflow-managed) with no card frame; host controls ride the toolbar row via the actions prop. Every piece of vendor chrome (toolbar, formula bar, sheet tabs, menus, portaled popups) resolves --nx-* tokens in light AND dark, re-derives live on theme/skin changes, and renders the app's OWN icon language (lucide + generated stroke glyphs re-registered over Univer's registry names — workbook-icons.tsx); free-surface (host owns the snapshot via value/onChange). Excel depth is CONFIG-COMPOSABLE via the config prop (WorkbookConfig): autofilter, sort, conditional formatting, data validation, find & replace and cell notes each mount their Univer preset only when enabled, and XLSX+CSV import/export ride the toolbar band as built actions. The engine loads ONLY behind LazyWorkbookSurface (a ~1.5MB-gz lazy chunk), so importing the block adds nothing to the eager bundle"],
  ["blocks/workbook/snapshot.ts", "wrapper", "workbookStoreKey · isWorkbookSnapshot · seedWorkbook · seedLargeWorkbook", "the workbook block's pure core (no @univerjs runtime, node-testable): app_state store-key namespacing, snapshot validation for a stored workbook blob, and the demo + 10k scale seed generators. The demo seed is 4 sheets that demonstrate the feature set on load — a Q1 budget model, an Ops table carrying the live data features (autofilter, Status dropdown, Spend colour scale, date + currency formats), a Summary sheet touring the formula library (SUMIF/COUNTIF/VLOOKUP/INDEX+MATCH/IF/TEXT/percentages, cross-sheet refs) and Notes; plugin state rides IWorkbookData.resources with payload shapes captured from Univer's own facade"],
  ["blocks/workbook/config.ts", "wrapper", "WorkbookConfig · DEFAULT_WORKBOOK_CONFIG · MINIMAL_WORKBOOK_CONFIG · resolveWorkbookConfig", "the workbook's composability contract: one flag per Excel capability (filters, sort, conditionalFormatting, dataValidation, findReplace, notes, importExport) so a company dials the same surface from a bare grid up to full Excel. Each enabled flag adds its Univer preset (and locale) to the mount; importExport adds the built toolbar actions instead. Full-Excel defaults, a MINIMAL preset for a plain grid, and resolveWorkbookConfig() to merge a partial over the defaults"],
  ["blocks/workbook/xlsx-io.ts", "wrapper", "exportWorkbookToXlsx · importXlsxToWorkbook · exportSheetToCsv · importCsvToWorkbook · triggerDownload", "the XLSX/CSV bridge between Univer's IWorkbookData and exceljs (MIT), lazy-loaded so the library only enters the bundle when a user actually imports or exports. Round-trips values, formulas, bold/italic/underline/strike, font size + family + colour, fill, number format, alignment, wrap, merges, column widths, row heights and frozen panes; CSV uses RFC-4180 quoting. Univer's OSS engine ships no client-side xlsx exchange, so this is the whole import/export path"],
  ["blocks/workbook/workbook-actions.tsx", "wrapper", "WorkbookIO · WorkbookIOController", "the import/export controls that ride the workbook's own toolbar band in the app's icon language: Export drops a format menu (Excel/CSV), Import routes a picked file through an inline confirm (it REPLACES the open workbook) and both report a transient result pill positioned clear of the vendor toolbar. Talks to the engine only through a WorkbookIOController (getSnapshot / replaceWorkbook / getActiveSheetId), so the surface owns the Univer lifecycle and this stays presentational"],
  ["blocks/document/DocumentSurface.tsx", "wrapper", "DocumentSurface · DocumentConfig", "a Notion×Google-Docs DOCUMENT as a native page surface: cover + icon + title header, a live outline rail, word/char count, page-width toggle, find & replace, and an export/import menu (Markdown / HTML / PDF / Word), wrapping the NotionEditor. Free-surface (host owns the snapshot via value/onChange), config-composable (DocumentConfig toggles every affordance), both themes, mobile-aware. Exported EAGERLY (the surface is light; its only heavy deps — docx/mammoth — are lazy inside editor-io), so a Pages host can mount a kind:document page with near-zero wiring — the same contract as WorkbookSurface"],
  ["blocks/document/snapshot.ts", "wrapper", "documentStoreKey · isDocumentSnapshot · seedDocument · coverBackground · COVER_PRESETS", "the document block's pure core (no editor runtime, node-testable): DocumentSnapshot shape ({id,title,blocks,icon?,cover?,pageWidth?}), app_state store-key namespacing, snapshot validation for a stored blob, cover-preset gradients, and the rich demo seed (every block type + inline mark, several headings for the outline)"],
  ["blocks/document/PageWorkspace.tsx", "wrapper", "PageWorkspace", "the standalone LINKED PAGE WORKSPACE — Notion's \"everything is a page; pages nest + reference each other\". Free-surface (value = the whole PageStore); renders the page-tree sidebar + breadcrumbs + Cmd-K quick-switcher (full-text search) + backlinks (linked references), and mounts a DocumentSurface for the active page, wiring the pageContext seam so sub-page blocks + [[page:]] links resolve/open/create against the store. This is what a Pages host mounts for a kind:document page"],
  ["blocks/document/PageTree.tsx", "wrapper", "PageTree", "the workspace sidebar: the page hierarchy derived live from the flat store, with expand/collapse, drag-to-move (before/after/inside a target via the store's movePage), per-node actions (new sub-page, favorite, duplicate, delete) and a Favorites shelf; presentation only, host owns every mutation via callbacks"],
  ["blocks/document/page-store.ts", "wrapper", "PageStore · PageNode · createPage · movePage · duplicatePage · deletePage · breadcrumb · backlinksOf · searchPages · seedPageStore", "the SPINE of the page workspace — a FLAT adjacency-list store (pages keyed by id, each with a parentId + fractional order + Block[] body). External-writer-tolerant (a concurrent writer patches ONE page); the tree, breadcrumbs, backlinks (link + sub-page + child kinds) and full-text search are all DERIVED by scanning the map. Links live as an inline [[page:id]] token + a `page` block. Pure + node-testable"],
  ["blocks/workbook/workbook-theme.ts", "wrapper", "deriveWorkbookTheme · accentScale · neutralScale · withLightTokens · themeSignature · useThemeNonce", "token → Univer theme derivation: accent, warm neutral and semantic scales from the live --nx-* tokens, resolved LIGHT-anchored to rgb (withLightTokens forces a light-resolution probe; Univer's canvas derives dark by inverting the light palette) and re-set through Univer's ThemeService on a data-theme / skin flip (themeSignature dedupes observer echoes); canvasGridTheme themes the GRID CANVAS itself (faint gridlines via the renderConfig hook, header paint via setCustomHeader, the freeze divider via gray.300) and re-derives with skins; pairs with the per-mode --univer-* value tables in workbook.css that theme all DOM chrome including portaled menus"],
  ["blocks/viewer3d/Viewer3DSurface.tsx", "wrapper", "Viewer3DSurface \u00b7 LazyViewer3DSurface", "3D viewer as a NATIVE page surface, two modes from one config. OBJECT: REAL MODEL IMPORT \u2014 glTF/GLB, .gltf+bin/textures and OBJ(+MTL) from a config URL, a file picker or drag-drop (progress, validation, plain-language errors; meshopt decoded, DRACO/KTX2 fail with a named reason; auto-center/auto-fit, previous model fully disposed) \u2014 plus a procedural sedan fallback, orbit/zoom/pan, 360\u00b0 spin, auto-rotate, camera presets, wireframe, PNG export. FLOORPLAN: a small DRAWING SET \u2014 true 2D technical PLAN (SVG: deduped walls, door swings, window symbols, chain + overall dimensions, per-room areas, measure tool with 5cm snap, scale bar, north arrow, title block), interactive 3D, sun-lit RENDER (time-of-day slider), orthographic ELEVATION (N/S/E/W) / SECTION (axis + cut slider) / AXON views, a room SCHEDULE table with level totals + gross internal area, metric\u2194imperial everywhere, print-res PNG export of any view. EDITABLE AS CAD: click selects rooms/walls/openings (spec in the technical APRON), dragging a wall moves it with dims/areas/schedule/3D following, openings slide/resize on their wall, the A\u2013A section marker drags the cut plane, facade markers jump to elevations; view switches are EASED CAMERA TRANSITIONS (dolly-zoom perspective\u2194ortho, orbiting ortho\u2194ortho, the section plane sweeping in; reduced-motion snaps). Hotspots are DATA-DRIVEN, occlusion-aware in 3D and marked on the 2D plan. Free-surface (value/onChange/reloadNonce); three.js only behind LazyViewer3DSurface (~194kB-gz lazy chunk), so an app declaring no 3D page pays ~0 eager bytes"],
  ["blocks/viewer3d/scene.ts", "wrapper", "viewer3dStoreKey \u00b7 isViewer3dSnapshot \u00b7 seedScene \u00b7 Viewer3DSnapshot", "the viewer3d block's pure core (no three.js runtime, node-testable): the whole viewer as ONE config/snapshot blob \u2014 mode, model source (gltf/obj URL, scale, up-axis, import toggle), floorplan levels+rooms+OPENINGS (doors/windows on wall lines) + title-block meta + wall thickness, hotspots, persisted view/units/level, control toggles \u2014 plus store-key namespacing, snapshot validation and the two seeded demos (a claims vehicle + a two-level house with openings and schedule data) that double as journey fixtures"],
  ["blocks/viewer3d/look.ts", "wrapper", "LOOK \u00b7 SUN \u00b7 ORTHO \u00b7 derivePalette \u00b7 derivePlanPalette", "the viewer's look/feel dial-board: ONE object holding every lighting, exposure, VSM-shadow, material-response and camera-framing/easing parameter (the surface and builders carry no magic numbers), the render-mode sun curve (hour \u2192 direction/warmth/intensity), the orthographic elevation/section framing constants, and the token \u2192 color palettes for BOTH the 3D scene and the 2D plan sheet (explicit hex so the SVG exports to PNG standalone). Tuning how the viewer LOOKS means editing this file"],
  ["blocks/viewer3d/builders.ts", "wrapper", "buildSedan \u00b7 buildLevel \u00b7 setLevelGhost", "procedural geometry: a sedan generated at runtime (extruded silhouette with real wheel arches, greenhouse + roof cap, five-spoke wheels, door seams/handles, mirrors, grille, plates, emissive lamps \u2014 zero asset bytes, license-free, CSP-safe) and a floor level built from DEDUPED wall segments with real door/window openings cut out (headers, sills, glazing panes) over per-room floor slabs, with the ghosting pass for inactive levels"],
  ["blocks/viewer3d/plan-geometry.ts", "wrapper", "polyArea \u00b7 levelWalls \u00b7 openingsOnWall \u00b7 formatArea \u00b7 formatLen", "pure floor-plan math shared by the 2D drawing, the room schedule and the 3D wall builder (a printed dimension and a built wall can never disagree): shoelace areas, bounds/envelopes, wall dedupe with interior/exterior tagging, opening projection + solid-span splitting, structural-grid dimension stops, metric/imperial formatting, standard-scale + scale-bar pickers. Light module \u2014 exported for hosts printing plan figures in reports"],
  ["blocks/viewer3d/ClaimWorkspace.tsx", "wrapper", "ClaimWorkspace \u00b7 LazyClaimWorkspace", "the claims DECISION workspace: three columns \u2014 activity/audit feed + machine assessment (verdict, per-criterion checks, reasoning) on the left; a MULTI-MODAL stage in the centre (the 3D model, photos and documents, switched via attachment cards with verification chips); the DECISION panel on the right (approve/partial/deny, adjusted amount vs claimed, reason, adjuster note, submit that WRITES into the snapshot + onDecision for the host workflow). Damage findings are authored annotations ANCHORED to the geometry (click the model to add, raycast-picked; severity/part/note/verified), synced pin\u2194list. seedClaim() ships the full demo. Both themes, tokens only"],
  ["blocks/viewer3d/Apron.tsx", "wrapper", "Apron", "the CAD-style TECHNICAL PANEL docked beside the drawing: the selected element's editable specification (room name/type/finish/ceiling + area/volume/perimeter; opening width/sill/head/swing; wall length/thickness/face/bounding rooms), layer visibility toggles, a clickable level tree, the sheet/title-block metadata as editable fields, and the room schedule as a docked pane whose rows select in the plan"],
  ["blocks/viewer3d/plan-edit.ts", "wrapper", "moveWall \u00b7 slideOpening \u00b7 resizeOpening \u00b7 patchRoom", "immutable floor-plan EDIT math shared by the apron's typed fields and the plan's direct manipulation (5 cm snap, min-room/min-opening clamps): drag-move an axis-aligned wall (every colinear vertex + riding opening shifts, adjacent rooms clamped), slide/resize openings along their wall, patch room/meta fields"],
  ["blocks/viewer3d/loaders.ts", "wrapper", "loadFromFiles \u00b7 loadFromSource \u00b7 normalizeModel", "model intake for the object viewer: glTF/GLB/OBJ(+MTL) from URLs or user files, multi-file bundles resolved through a blob-URL LoadingManager, meshopt decoding, size/format validation, progress, actionable error messages (names DRACO/KTX2/CSP causes), up-axis + auto-normalize, and blob release on replace"],
  ["skins/skin.ts", "skins", "Skin · skinToCss() · applySkin()", "brand-as-data: a small JSON in, the full --nx-* set out (accent ramp, chrome, radius, fonts, labels, density, shadows, dark derivation, raw overrides) — see docs/THEMING.md"],
  ["skins/presets.ts", "skins", "skinPresets (nexus · ember · warm-opt)", "built-in skins: the house identity, a full-range org example (dark chrome, sharp corners, own palette/type), and a warm option-chip palette preset (skin-overridable; default palette unchanged)"],
  ["tokens/tokens.css", "tokens", "--nx-* custom properties", "the blank canvas: palette/type/geometry/motion + chrome/label tokens; light+dark first-class; skins WRITE this at runtime, an app's design lock edits it statically"],
  ["tokens/motion.css", "tokens", "nx motion utilities", "riseIn/popIn entrance families + .nx-tap-scale/.nx-hover-lift micro-interactions, tokenized on the ease vars; ONE reduced-motion guard (opt back in with data-motion=\"always\")"],
  ["tokens/resolve.ts", "tokens", "resolveCssColor · resolveTokenColor · useTokenColors · subscribeTokenColors", "token → rgba-literal resolution for GL/canvas consumers that cannot read CSS custom properties (maplibre paint, canvas grids); resolves any color expression incl. color-mix chains, re-resolves live on data-theme / skin-tag / OS-scheme changes"],
  ["styles/shadcn.css", "tokens", "shadcn semantic bridge", "maps shadcn variables onto --nx-* + Tailwind v4 @theme; import AFTER tokens.css"],
  ["hooks/usePollRev.ts", "hook", "usePollRev", "live-sync: poll a revision counter, fire onChange when another writer bumped it (transport-agnostic fetchRev; pauses while the tab is hidden)"],
  ["hooks/useAsyncOp.ts", "hook", "useAsyncOp · computeAsyncOp", "drive a long off-machine op with a stall guard: poll while in-flight, onSettle once, stalled past a threshold (injectable clock)"],
  ["hooks/useDebouncedSave.ts", "hook", "useDebouncedSave · createDebouncer", "debounced autosave: coalesce rapid edits into ONE persist + a saveState (idle→saving→saved)"],
  ["lib/utils.ts", "lib", "cn()", "class merge (clsx + tailwind-merge) — the shadcn contract"],
];

const manifest = JSON.parse(readFileSync(path.join(SRC, "components", "ui", ".vendor-manifest.json"), "utf8"));
const items = [];

for (const [name, meta] of Object.entries(manifest.components).sort()) {
  items.push({
    name,
    kind: name.startsWith("use-") ? "vendored-hook" : "vendored",
    import: meta.files.map((f) => "src/" + f).join(" · "),
    when: WHEN[name] ?? "(add a WHEN line in scripts/gen-docs.mjs)",
    source: `shadcn/ui ${manifest.style} (MIT — NOTICE.md)`,
  });
}
for (const [name, meta] of Object.entries(manifest.blocks ?? {}).sort()) {
  items.push({
    name,
    kind: "block",
    import: meta.files.map((f) => "src/" + f).join(" · "),
    when: BLOCK_WHEN[name] ?? "(add a BLOCK_WHEN line in scripts/gen-docs.mjs)",
    source: `shadcn/ui ${manifest.style} block (MIT — NOTICE.md); copy-out example tissue, not a runtime import`,
  });
}
for (const [file, kind, exports_, when] of OURS) {
  if (!existsSync(path.join(SRC, file))) continue;
  items.push({ name: exports_, kind, import: "src/" + file, when, source: kind === "record-core" ? "ours (rebuilt — PROVENANCE.md)" : "ours" });
}

const missing = items.filter((i) => i.when.startsWith("(add"));
if (missing.length) console.error("WHEN lines missing:", missing.map((m) => m.name).join(", "));

/* machine catalog — DETERMINISTIC output (stamped from the vendor manifest, never
   `now`): CI regenerates and diffs, so any nondeterminism would fail every run. */
writeFileSync(path.join(DOCS, "catalog.json"), JSON.stringify({ vendoredAt: manifest.fetchedAt, style: manifest.style, count: items.length, items }, null, 2) + "\n");

/* human/agent INDEX */
const rows = items
  .map((i) => `| ${i.name} | ${i.kind} | \`${i.import}\` | ${i.when} |`)
  .join("\n");
writeFileSync(
  path.join(DOCS, "INDEX.md"),
  `# nexus-ui — component catalog

GENERATED by \`node scripts/gen-docs.mjs\` (vendor set of ${String(manifest.fetchedAt).slice(0, 10)}) from the live tree — edit the WHEN dictionary in the script, never this file. Machine-readable twin: \`docs/catalog.json\`. Deep docs: \`docs/record-core.md\` (the config-driven record system) \u00b7 \`docs/viewer3d.md\` (the 3D object / floor-plan surface) · \`AGENTS.md\` (how an agent works in this repo).

${items.length} entries: ${Object.keys(manifest.components).length} vendored shadcn items + wrappers + record-core + tokens.

| Component | Kind | Import | When to use |
|---|---|---|---|
${rows}

## Rules of the road
- **Never edit \`src/components/ui/*\`** — vendored verbatim; re-vendoring overwrites. House opinions live in \`src/primitives/\` wrappers.
- Styling changes go through **tokens** (\`src/tokens/tokens.css\`) — the shadcn bridge derives from them; a design lock restyles the whole kit by editing tokens only.
- A control missing here is added to THIS library (extend \`scripts/vendor-shadcn.mjs\` COMPONENTS or write a wrapper), never hand-built in one app.
`,
);
console.log(`catalog: ${items.length} entries → docs/INDEX.md + docs/catalog.json${missing.length ? " (WITH GAPS)" : ""}`);
