# Recipes

Task-shaped guides for composing the kit. Each recipe says what you get, what to
pass, and where the seams are.

---

## Workbook: dialling Excel depth per company

The workbook block (`src/blocks/workbook/`) mounts Univer as a full spreadsheet
surface. Every Excel capability beyond the core grid is **config-gated**, so the same
component serves a bare read-mostly grid and a full financial model.

```tsx
import { LazyWorkbookSurface, MINIMAL_WORKBOOK_CONFIG } from "@nexus/ui";

// full Excel (the default — every flag on)
<LazyWorkbookSurface value={snapshot} onChange={save} />

// a plain grid: formulas + editing only
<LazyWorkbookSurface value={snapshot} onChange={save} config={MINIMAL_WORKBOOK_CONFIG} />

// dial individual capabilities; omitted keys keep the full-Excel default
<LazyWorkbookSurface
  value={snapshot}
  onChange={save}
  config={{ notes: false, dataValidation: false }}
/>
```

### The flags

| Flag | Default | What it adds |
|---|---|---|
| `filters` | on | Column autofilter — per-column dropdown with value counts, search, sort, and by-value / by-colour / by-condition modes |
| `sort` | on | Range sort (ascending / descending / custom) from the toolbar and context menu |
| `conditionalFormatting` | on | Colour scales, data bars and highlight rules (see the seam below) |
| `dataValidation` | on | Dropdown lists, number/date ranges, checkboxes — rendered as in-cell pickers |
| `findReplace` | on | Workbook-wide find & replace |
| `notes` | on | Cell notes / comments (`Add Note` in the cell context menu) |
| `importExport` | on | XLSX + CSV import and export actions in the workbook's own toolbar |

Everything else — the formula engine (400+ functions across Financial, Logical, Text,
Date & Time, Lookup & Reference, Math & Trig, Statistical, Engineering, Information
and Database), multi-sheet tabs, freeze panes, merge, number formats, insert/delete
rows and columns, undo/redo, the formula bar and the status-bar aggregation — is core
and always present.

Turning a flag off removes the whole capability from the mount: its Univer preset is
never registered, so it costs nothing in the chunk and its menu items never appear.

### Import / export

`importExport` puts **Export** and **Import** in the toolbar band.

- **Export** offers Excel (`.xlsx`) or CSV. XLSX carries every sheet with values,
  formulas, fonts (bold/italic/underline/strike, size, family, colour), fills, number
  formats, alignment, wrap, merges, column widths, row heights and frozen panes. CSV
  writes the active sheet's values.
- **Import** accepts `.xlsx` or `.csv`. Because it REPLACES the open workbook, it
  always routes through an inline confirm naming the file. Both actions report a
  transient result pill.

The conversion lives in `xlsx-io.ts` and is built on **exceljs** (MIT), imported
lazily — the library only enters the bundle when someone actually imports or exports.
Univer's OSS engine has no client-side xlsx exchange of its own (that ships in its
licensed "advanced" preset, which also expects a server), so this is the entire path.

You can call the converters directly, without the UI:

```ts
import { exportWorkbookToXlsx, importXlsxToWorkbook, triggerDownload } from "@nexus/ui";

const blob = await exportWorkbookToXlsx(snapshot);
triggerDownload(blob, "budget.xlsx");

const snapshot2 = await importXlsxToWorkbook(await file.arrayBuffer());
```

**Consumer dependency:** the block treats `@univerjs/*` and `exceljs` as peer
dependencies the consuming app installs (the same pattern the engine already used).
Install the presets matching the flags you enable, plus `exceljs` if `importExport`
is on.

### The demo seed

`seedWorkbook()` returns a four-sheet workbook that demonstrates the feature set on
load — useful as a fixture, a first-run state, or a showcase:

- **Budget** — a Q1 model: merged title, per-row and per-column `=SUM`, an `=AVERAGE`
  row, `$` formats, frozen header row + first column.
- **Ops** — a 12-line operating table wired to the data features: an autofilter over
  the header range, a Status dropdown (data validation), a Spend colour scale, and
  dates rendered through a date number format.
- **Summary** — a live tour of the formula library: `SUM`/`AVERAGE`/`MAX`/`COUNTA`,
  `SUMIF`/`COUNTIF`, `VLOOKUP`, `INDEX`+`MATCH`, `IF`, `TEXT`+`MIN`, `UPPER`,
  percentage shares, and cross-sheet references into both other sheets.
- **Notes** — a small cross-sheet reference sheet.

Plugin state (filter, conditional formatting, data validation) rides
`IWorkbookData.resources` as `{name, data}` pairs. Those payload shapes were captured
from Univer's own facade rather than hand-written; if you need new ones, drive the
facade (`createFilter`, `newConditionalFormattingRule`, `newDataValidation`) and read
the shapes back out of `fWorkbook.save()`.

### Seams and limits

- **Conditional formatting does not paint.** On Univer `0.25.1` the rules register,
  persist through save/load, and are editable through the CF panel — but the canvas
  does not render them. Verified four ways: a colour scale from the snapshot, a colour
  scale applied live through the facade, a plain `whenNumberGreaterThan` +
  `setBackground` highlight rule, and the same with a forced recompute — none paint,
  with no console error, on both the themed surface and a stock unthemed page. The
  flag stays because the model and UI work; treat the visual as pending an engine fix.
- **Charts and pivot tables** live in Univer's licensed `preset-sheets-advanced`
  (which also expects a license key and, for exchange, a server). They are not wired
  here. A chart is reachable without that preset by reading the selected range and
  rendering with `recharts` (already a dependency) in a panel beside the grid — a
  deliberate follow-on, not half-built here.
- **Import fidelity.** Rich text collapses to plain text and hyperlinks import as
  their display text. Charts, images, pivot tables and macros in a source `.xlsx` are
  not imported. Dates convert through Excel serials.
- **CSV** is single-sheet by nature: export writes the active sheet's values (not
  formulas), and import produces a one-sheet workbook.
- **Comments are notes, not threads.** The `notes` flag gives Excel-style sticky notes
  (one body per cell). Threaded comments — replies, resolve — are a separate Univer
  preset, not wired here (below).
- **No collaboration layer.** No presence, co-editing, version history or track
  changes. The surface is single-writer: the host owns one snapshot.

### Free presets available but not wired

These exist on npm at `0.25.1`, need no license, and each slots into the same
`WorkbookConfig` pattern — the cheapest way to add parity:

| Preset | Adds |
|---|---|
| `@univerjs/preset-sheets-thread-comment` | threaded comments (replies, resolve) |
| `@univerjs/preset-sheets-table` | Excel-style structured tables |
| `@univerjs/preset-sheets-hyper-link` | hyperlinks (also fixes import flattening) |
| `@univerjs/preset-sheets-drawing` | images / floating objects |

To wire one: add a flag to `WorkbookConfig`, import the preset + its `locales/en-US`
and `lib/index.css`, and push it into `buildPresets()` in `WorkbookSurface.tsx` behind
the flag. That is the whole pattern.
