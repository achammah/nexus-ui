# Sheet-depth lane self-review — Excel features for the workbook surface

Branch `feat/sheet-depth` off `3260ec4` (which already carried the Univer CHROME
reskin). That reskin changed how the spreadsheet LOOKED; this lane is about what it
can DO. Reference points throughout: Excel and Google Sheets.

Every verdict below is backed by a screenshot in this directory, taken against a live
harness at `reducedMotion: "no-preference"` in an isolated browser (the shared
Playwright MCP was contended by other lanes, so this lane drove its own).

---

## Per-feature verdict

| Feature | Verdict | WIRED / BUILT / SEAM | Evidence |
|---|---|---|---|
| **XLSX export** | ✅ works | **BUILT** (exceljs) | `sd-export-status.png`; E2E re-opens the downloaded file and asserts cells |
| **XLSX import** | ✅ works | **BUILT** (exceljs) | `sd-import-confirm.png` → `sd-import-result.png` |
| **CSV export / import** | ✅ works | **BUILT** | round-trip test output (below) |
| **Autofilter** | ✅ works | **WIRED** (Univer preset) | `sd-filter-panel.png`, `sd-filter-applied.png` |
| **Sort** | ✅ present | **WIRED** | `sd-ctxmenu.png` (context menu), `sd-filter-panel.png` (asc/desc in panel) |
| **Data validation** | ✅ works | **WIRED** | `sd-ops.png` — dropdown pill on every Status cell |
| **Find & replace** | ✅ present | **WIRED** | `sd-overflow.png` (search icon in the toolbar's feature row) |
| **Cell notes** | ✅ present | **WIRED** | `sd-ctxmenu.png` — "Add Note" |
| **Formula engine** | ✅ broad + correct | already core | `sd-summary.png`, `sd-overflow.png` (11 function categories) |
| **Number formats** | ✅ works | already core | `sd-ops.png` — currency, date, percent all render |
| **Freeze panes / merge / multi-sheet** | ✅ works | already core | every shot (4 tabs, frozen headers) |
| **Conditional formatting** | ⚠️ **model works, does not paint** | WIRED, **SEAM** | see below |
| **Charts** | ❌ not built | **SEAM (documented)** | licensed preset — see below |
| **Pivot tables** | ❌ not built | **SEAM (documented)** | licensed preset — see below |

---

## The headline: import / export

Univer's OSS engine ships **no** client-side xlsx exchange — that lives in its
licensed `preset-sheets-advanced`, which also expects a server. So this is genuinely
BUILT, not wired: `src/blocks/workbook/xlsx-io.ts` bridges Univer's `IWorkbookData`
and **exceljs** (MIT) in both directions, lazy-imported so the library only enters the
bundle when a user actually imports or exports.

Round-trips in both directions: values, formulas, bold/italic/underline/strike, font
size + family + colour, fill, number format, alignment, wrap, merges, column widths,
row heights, frozen panes. CSV uses RFC-4180 quoting.

**Export proof** (live, through the UI, not a unit test): clicking Export → Excel
downloads a real `.xlsx`; the E2E re-opens it with exceljs and asserts —

```
EXPORT downloaded: workbook.xlsx → 7829 bytes
  A1: "Q1 Budget 2026" | B3: 12000
  E3: {"formula":"SUM(B3:D3)","result":37000}
  Notes!B3: {"formula":"Budget!E7","result":76900}
EXPORT PASS ✓
```

The cross-sheet reference surviving is the one I'd have bet against; it holds.

**Import proof**: a fixture built independently in exceljs, imported through the UI
(`sd-import-result.png`) — bold red font colour, `$` number formats, a merge, a
computed `SUM`, two sheets and a frozen header all land and render.

**Node round-trip** (`_harness/io-test.ts`), seed → xlsx → back:

```
B3 value: 12000 | E3 formula: =SUM(B3:D3)
A1 title: Q1 Budget 2026 | style resolved: {"bl":1,"fs":15,"ht":2,"vt":2}
merges[0]: {"startColumn":0,"startRow":0,"endColumn":4,"endRow":0}
freeze: {"xSplit":1,"ySplit":2,...}   Notes B3 formula: =Budget!E7
ROUND-TRIP PASS ✓
```

Import replaces the open workbook, so it routes through an inline confirm naming the
file, and both actions report a transient result pill. The pill is positioned clear of
the vendor toolbar — an earlier version let a long filename push the buttons over
Univer's own controls (`sd-import-result.png` is the fixed state).

---

## Composability

`WorkbookConfig` (`config.ts`) gates each capability: `filters`, `sort`,
`conditionalFormatting`, `dataValidation`, `findReplace`, `notes`, `importExport`.
Full-Excel defaults; `MINIMAL_WORKBOOK_CONFIG` for a bare grid; `resolveWorkbookConfig`
merges a partial. A disabled flag never registers its preset — it costs nothing in the
chunk and its menu items never appear. Documented in `docs/RECIPES.md`.

## Demo density

The seed is now four sheets that demonstrate the features on load rather than
describing them: **Budget** (the original Q1 model), **Ops** (a 12-line table with a
live autofilter, Status dropdowns and date/currency formats), **Summary** (a formula
tour — SUMIF/COUNTIF/VLOOKUP/INDEX+MATCH/IF/TEXT/UPPER/percentages plus cross-sheet
refs), **Notes**. Plugin state rides `resources`, with payload shapes **captured from
Univer's own facade** rather than guessed.

Every Summary value was checked against the data by hand: the four region SUMIFs sum
to the total, the shares sum to 100%, VLOOKUP and INDEX/MATCH resolve the right
owners, the cross-sheet delta and percentage are right.

**A real bug this surfaced:** dates rendered a day late. The Excel serial conversion
double-counted the 1900 leap-year bug — the 1899-12-30 epoch already absorbs it. Fixed
in both the seed and the xlsx import path.

---

## The seam I did not paper over: conditional formatting

Rules register, persist through save/load, and are editable — but **the canvas does
not paint them** on Univer 0.25.1. Four distinct mechanisms, all negative, no console
error:

1. colour scale seeded via `resources` → not painted (`sd-ops.png`);
2. the same colour scale applied live through the facade → not painted (`sd-cf-live.png`);
3. a plain `whenNumberGreaterThan(5000).setBackground("#FF0000")` highlight → not
   painted (`sd-cf-highlight.png`);
4. the same, then a forced recompute via a cell write → not painted, though the write
   itself lands and repaints the canvas (`sd-cf-nudge.png`, "nudge" visible in H1).

Reproduced on both the reskinned surface and a **stock, unthemed** Univer page, so it
is not the reskin. `getConditionalFormattingRules()` returns the rule with the correct
range, and the preset does register both the model and the UI/render plugin. My read
is an engine-side gap, not a wiring mistake — but I could not fix it from here, so it
is flagged rather than claimed. The flag stays on because the model and panel work.

## Charts and pivot tables — not built, deliberately

Both live in Univer's **licensed** `preset-sheets-advanced` (no free
`preset-sheets-chart` or `preset-sheets-pivot-table` exists on npm at 0.25.1; verified).
Wiring them means a license key and, for exchange, a server. Rather than half-build,
they are documented as follow-ons. A chart is reachable without that preset by reading
the selected range and rendering with `recharts` (already a dependency) in a panel — a
clean next lane, roughly a day, not something to bolt on at the end of this one.

---

## Bars

- **tsc + vite**: clean. `tsc --noEmit` → 0 errors; production build succeeds.
- **Console**: 0 errors across every scripted run. Two warnings I caused early
  (ref-forwarding through the vendored non-`forwardRef` shadcn Button, and again
  through the vendored Dialog overlay) were eliminated by owning those two controls
  locally — `src/components/ui/*` is never edited, per the repo invariant.
- **Light + dark**: `sd-ops.png` / `sd-ops-dark.png`, `sd-summary.png` /
  `sd-summary-dark.png`. Dark is fully coherent — filter chips, dropdown pills,
  Export/Import all take the token palette, no light-mode leak.
- **Mobile** (390×780, `sd-mobile.png`): the toolbar collapses, the IO buttons collapse
  to icons (asserted programmatically, not eyeballed), the grid and freeze panes work,
  sheet tabs overflow. Limited, as a phone spreadsheet must be — but not broken.
- **Tokens**: all new chrome is `--nx-*`; no hardcoded colours.
- **Keyboard/a11y**: IO buttons are real `<button>`s with `aria-label`s and a visible
  `:focus-visible` ring; the export menu is the house Radix menu (arrow keys, Escape);
  the confirm strip is a labelled group, autofocuses Replace, and Escape cancels; the
  result pill is `role="status"`.

## Bundle delta (measured, production build)

| Chunk | Before | After |
|---|---|---|
| Engine (`WorkbookSurface`, lazy) | 5,756.90 kB / **1,611.01 kB gz** | 6,409.74 kB / **1,767.89 kB gz** |
| `exceljs` (separate, lazy) | — | 938.39 kB / **269.51 kB gz** |

The six feature presets cost **+156.88 kB gz** on a chunk that only loads when the
surface mounts. exceljs is its own chunk that loads only on the first import/export —
a user who never exports never pays for it. The eager bundle is unchanged.

---

## Parity audit vs Excel / Google Sheets

I am not going to certify this "Excel-grade". Here is the feature-by-feature table.
"Exercised" means I drove it in a browser and looked at the result; "present" means it
is wired and reachable but I did not put it through its paces.

| Feature | Excel / Google Sheets | Ours | Verdict |
|---|---|---|---|
| Cell editing, multi-sheet, freeze, merge | full | full, cross-sheet refs exercised | ✅ **parity** |
| Formula engine | ~500 fns, autocomplete | 400+ fns across 11 categories, autocomplete with descriptions (`sd-formula-autocomplete.png`) | ✅ **near parity** — see array-formula caveat |
| Number formats | currency/date/percent/custom | same, pattern-based; currency+date+percent exercised | ✅ **near parity** |
| Autofilter | by value / colour / condition, counts | all three modes + counts, exercised | ✅ **parity** |
| Sort | single + multi-column | asc/desc/custom present; **multi-column not verified** | 🟡 **present, partly unverified** |
| Data validation | list, number, date, text-length, custom formula, checkbox | same builder surface; **only the list dropdown exercised** | 🟡 **near parity, thinly verified** |
| Find & replace | full | wired and reachable; **not exercised** | 🟡 **present, unverified** |
| Named ranges | full manager | Name Box "Manager named" panel + facade (`insertDefinedName`); **not exercised end-to-end** | 🟡 **present, unverified** |
| XLSX export | native | values, formulas, fonts, fills, formats, alignment, merges, widths, freeze — round-trip proven | ✅ **parity for data** |
| XLSX import | native | same, **minus** charts, images, pivots, macros; rich text flattens | 🟡 **parity for data, not for objects** |
| CSV import/export | full | full (RFC-4180) | ✅ **parity** |
| Status-bar stats | Sum/Avg/Count/Min/Max | same (`sd-namebox.png`) | ✅ **parity** |
| **Conditional formatting** | full, painted | rules register/persist/edit — **canvas never paints them** | ❌ **broken** |
| **Charts** | extensive | **none** | ❌ **absent** |
| **Pivot tables** | core analysis tool | **none** | ❌ **absent** |
| **Cell comments** | *threaded*: replies, @mentions, resolve | **sticky notes only** (exercised, `sd-note-hover.png`) | ❌ **thin** |
| **Track changes / version history** | full | **none** | ❌ **absent** |
| **Real-time collaboration** (presence, co-edit) | full | **none** | ❌ **absent** |
| Images / drawings in sheet | full | **none** | ❌ **absent** |
| Hyperlinks | full | **none** (import flattens to text) | ❌ **absent** |
| Structured tables (Excel Tables) | full | **none** | ❌ **absent** |

### The honest summary

**What a real user can genuinely do today:** open a workbook, write `VLOOKUP`/`SUMIF`
across sheets with working autocomplete, format currency and dates, freeze headers,
filter a table by value with live counts, sort, constrain a column to a dropdown, leave
a note, and get their file in and out as `.xlsx` with formulas and formatting intact.
That is a real, useful spreadsheet, and interchange — the thing that decides whether
anyone can adopt it at all — is closed and proven.

**What they cannot do:** make a chart, build a pivot, see a conditional format, hold a
comment thread with a colleague, or see who else is in the document. For a finance or
ops user those are not garnish. A model you cannot chart and cannot pivot is a model
you finish in Excel — which means this is currently a strong *data* surface and a weak
*analysis and collaboration* surface.

So: **parity for entry, calculation, formatting and interchange. Not parity for
analysis (charts, pivot), presentation (conditional formatting), or collaboration
(threaded comments, presence, history).**

### Five free presets I did NOT wire — cheapest depth wins

Verified available on npm at 0.25.1, no license, not in this PR:

| Preset | Closes |
|---|---|
| `@univerjs/preset-sheets-thread-comment` | **threaded comments** with replies/resolve — the collaboration gap |
| `@univerjs/preset-sheets-table` | Excel-style structured tables |
| `@univerjs/preset-sheets-hyper-link` | hyperlinks (also fixes import flattening) |
| `@univerjs/preset-sheets-drawing` | images / floating objects |
| `@univerjs/preset-sheets-sort` (multi-column depth) | already wired; depth unverified |

These are the cheapest parity gains available — each is wiring, not building, and each
slots into the existing `WorkbookConfig` pattern. **I did not wire them because they
were not in this lane's brief**, not because they are hard.

Charts and pivot are the expensive ones: both live in Univer's **licensed**
`preset-sheets-advanced`. A chart is reachable without it by reading the selected
range and rendering with `recharts` (already a dependency); a pivot realistically is
not, short of building one.

### Unmeasured

- Import performance on a large `.xlsx` (the 10k scale seed exists, but I never pushed
  a big real file through the converter — no progress state either).
- Array / dynamic-array formulas (spill ranges, `LAMBDA`) — untested.
- Concurrent edits of the same snapshot (the surface is single-writer by design).

## What I'd do next, in order

1. **Threaded comments** (`preset-sheets-thread-comment`) — closes the collaboration
   gap for one preset's worth of wiring.
2. **Charts from a range** via `recharts` — no license, unblocks the biggest analysis gap.
3. Chase the **conditional-formatting paint** with the repro above (Univer-side).
4. `table` + `hyper-link` + `drawing` presets — three more cheap parity wins.
5. Import performance on a large workbook, with a progress state if needed.
6. Pivot tables — only worth it if the licensed preset becomes an option.
