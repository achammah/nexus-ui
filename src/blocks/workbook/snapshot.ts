// The workbook block adopts Univer (@univerjs, Apache-2.0) as a mounted app-shell.
// This module is deliberately runtime-free of @univerjs (type-only imports) so the
// light helpers (store key, validation, seed) stay in the eager bundle and node-
// testable, while the heavy engine loads only inside WorkbookSurface's lazy chunk.
import type { IWorkbookData, LocaleType } from "@univerjs/core";

/* A free-surface workbook persists as ONE snapshot blob (Univer's IWorkbookData,
   the exact shape `fWorkbook.save()` returns) under an app-state key — NOT record
   data. The key is namespaced so several standalone workbook pages can coexist. */
export const WORKBOOK_STORE_PREFIX = "workbook:";
export const workbookStoreKey = (pageKey: string): string => `${WORKBOOK_STORE_PREFIX}${pageKey}`;

/* A stored value is a usable workbook only if it carries Univer's minimal shape.
   A missing/foreign/corrupt blob fails this and the surface recovers to a fresh
   workbook rather than crashing the mount. */
export function isWorkbookSnapshot(x: unknown): x is IWorkbookData {
  if (!x || typeof x !== "object") return false;
  const w = x as Record<string, unknown>;
  return (
    typeof w.id === "string" &&
    Array.isArray(w.sheetOrder) &&
    w.sheetOrder.length > 0 &&
    typeof w.sheets === "object" &&
    w.sheets !== null
  );
}

const EN_US = "enUS" as unknown as LocaleType;

/* Style ids referenced by seeded cells. Color-agnostic on purpose: bold, number
   format, alignment and merge carry the seed's formatting so no brand hex lands in
   demo DATA — the brand accent reaches the sheet through the theme object + the
   --univer-* binding (workbook-theme.ts), and a live fill is exercised by the
   format journey. */
const STYLES: NonNullable<IWorkbookData["styles"]> = {
  title: { bl: 1, fs: 15, ht: 2, vt: 2 },
  header: { bl: 1, ht: 2 },
  label: { bl: 1 },
  money: { n: { pattern: "$#,##0" } },
  total: { bl: 1, n: { pattern: "$#,##0" } },
  date: { n: { pattern: "d mmm yyyy" } },
  pct: { n: { pattern: "0.0%" } },
  note: { fs: 10 },
};

/* Ops rows — the demo's realistic operating table. Dates are Excel serials (the
   `date` style renders them); this is the table the autofilter, the Spend colour
   scale and the Status dropdown all attach to. */
const OPS_ROWS: Array<[number, string, string, string, string, number]> = [
  [46034, "North", "Ada Cole", "Software", "On track", 4200],
  [46034, "South", "Ben Ortiz", "Marketing", "At risk", 8100],
  [46041, "North", "Ada Cole", "Travel", "On track", 1500],
  [46041, "East", "Chen Wu", "Software", "Blocked", 6400],
  [46055, "West", "Dana Silva", "Marketing", "On track", 5200],
  [46055, "South", "Ben Ortiz", "Travel", "On track", 2300],
  [46069, "East", "Chen Wu", "Salaries", "At risk", 12800],
  [46069, "North", "Ada Cole", "Marketing", "On track", 3900],
  [46083, "West", "Dana Silva", "Software", "Blocked", 7100],
  [46083, "South", "Ben Ortiz", "Salaries", "On track", 11200],
  [46097, "East", "Chen Wu", "Travel", "On track", 1800],
  [46097, "West", "Dana Silva", "Marketing", "At risk", 6600],
];

/* Shared per-sheet scaffolding — the fields every IWorksheetData needs but that
   carry no demo meaning, so each sheet below reads as its CONTENT. */
const sheetBase = (id: string, name: string, rows: number, cols = 26) => ({
  id, name, tabColor: "", hidden: 0,
  rowCount: rows, columnCount: cols,
  defaultColumnWidth: 100, defaultRowHeight: 24,
  zoomRatio: 1, scrollTop: 0, scrollLeft: 0,
  freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
  mergeData: [] as unknown[],
  rowData: {}, columnData: {} as Record<number, { w: number }>,
  rowHeader: { width: 46, hidden: 0 }, columnHeader: { height: 24, hidden: 0 },
  showGridlines: 1, selections: ["A1"], rightToLeft: 0,
});

/* The Ops sheet: header row + OPS_ROWS, frozen header, $ and date formats. */
function opsSheet() {
  const cellData: Record<number, Record<number, unknown>> = {
    0: { 0: { v: "Operations log", s: "title" } },
    1: {
      0: { v: "Date", s: "header" }, 1: { v: "Region", s: "header" }, 2: { v: "Owner", s: "header" },
      3: { v: "Category", s: "header" }, 4: { v: "Status", s: "header" }, 5: { v: "Spend", s: "header" },
    },
  };
  OPS_ROWS.forEach(([date, region, owner, category, status, spend], i) => {
    cellData[i + 2] = {
      0: { v: date, s: "date" }, 1: { v: region }, 2: { v: owner },
      3: { v: category }, 4: { v: status }, 5: { v: spend, s: "money" },
    };
  });
  const last = OPS_ROWS.length + 2; // first free row
  cellData[last + 1] = { 4: { v: "Total", s: "label" }, 5: { f: `=SUM(F3:F${last})`, s: "total" } };
  return {
    ...sheetBase("sheet-ops", "Ops", 200),
    freeze: { xSplit: 0, ySplit: 2, startRow: 2, startColumn: 0 },
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 5 }],
    cellData,
    columnData: { 0: { w: 120 }, 2: { w: 120 }, 3: { w: 110 }, 4: { w: 100 }, 5: { w: 110 } },
  };
}

/* The Summary sheet: a broad, live exercise of the formula library — aggregation
   (SUM/AVERAGE/MAX), conditional aggregation (SUMIF/COUNTIF), lookup (VLOOKUP and
   INDEX+MATCH), logic (IF), text and date functions, and cross-sheet references
   into both Ops and Budget. Every cell here recalculates on load. */
function summarySheet() {
  const lastOps = OPS_ROWS.length + 2;
  const R = (col: string) => `Ops!${col}3:${col}${lastOps}`;
  const cellData: Record<number, Record<number, unknown>> = {
    0: { 0: { v: "Summary", s: "title" } },
    1: { 0: { v: "Aggregates", s: "header" }, 1: { v: "Value", s: "header" } },
    2: { 0: { v: "Total spend", s: "label" }, 1: { f: `=SUM(${R("F")})`, s: "money" } },
    3: { 0: { v: "Average line", s: "label" }, 1: { f: `=AVERAGE(${R("F")})`, s: "money" } },
    4: { 0: { v: "Largest line", s: "label" }, 1: { f: `=MAX(${R("F")})`, s: "money" } },
    5: { 0: { v: "Lines logged", s: "label" }, 1: { f: `=COUNTA(${R("B")})` } },

    7: { 0: { v: "By region", s: "header" }, 1: { v: "Spend", s: "header" }, 2: { v: "Share", s: "header" } },
    8: { 0: { v: "North" }, 1: { f: `=SUMIF(${R("B")},A9,${R("F")})`, s: "money" }, 2: { f: "=B9/$B$3", s: "pct" } },
    9: { 0: { v: "South" }, 1: { f: `=SUMIF(${R("B")},A10,${R("F")})`, s: "money" }, 2: { f: "=B10/$B$3", s: "pct" } },
    10: { 0: { v: "East" }, 1: { f: `=SUMIF(${R("B")},A11,${R("F")})`, s: "money" }, 2: { f: "=B11/$B$3", s: "pct" } },
    11: { 0: { v: "West" }, 1: { f: `=SUMIF(${R("B")},A12,${R("F")})`, s: "money" }, 2: { f: "=B12/$B$3", s: "pct" } },

    13: { 0: { v: "Lookups & logic", s: "header" }, 1: { v: "Result", s: "header" } },
    14: { 0: { v: "Owner for East (VLOOKUP)", s: "label" }, 1: { f: `=VLOOKUP("East",Ops!B3:C${lastOps},2,FALSE)` } },
    15: { 0: { v: "Owner for West (INDEX/MATCH)", s: "label" }, 1: { f: `=INDEX(${R("C")},MATCH("West",${R("B")},0))` } },
    16: { 0: { v: "Lines at risk (COUNTIF)", s: "label" }, 1: { f: `=COUNTIF(${R("E")},"At risk")` } },
    17: { 0: { v: "Blocked spend (SUMIF)", s: "label" }, 1: { f: `=SUMIF(${R("E")},"Blocked",${R("F")})`, s: "money" } },
    18: { 0: { v: "Plan check (IF)", s: "label" }, 1: { f: '=IF(B3>60000,"Over plan","Within plan")' } },
    19: { 0: { v: "First logged (TEXT+MIN)", s: "label" }, 1: { f: `=TEXT(MIN(${R("A")}),"d mmm yyyy")` } },
    20: { 0: { v: "Top category (UPPER)", s: "label" }, 1: { f: `=UPPER(INDEX(${R("D")},MATCH(MAX(${R("F")}),${R("F")},0)))` } },

    22: { 0: { v: "Cross-sheet", s: "header" }, 1: { v: "Value", s: "header" } },
    23: { 0: { v: "Q1 budget total", s: "label" }, 1: { f: "=Budget!E7", s: "money" } },
    24: { 0: { v: "Ops vs budget", s: "label" }, 1: { f: "=B3-B24", s: "money" } },
    25: { 0: { v: "Ops as % of budget", s: "label" }, 1: { f: "=B3/B24", s: "pct" } },
  };
  return {
    ...sheetBase("sheet-summary", "Summary", 120),
    freeze: { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 },
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 }],
    cellData,
    columnData: { 0: { w: 250 }, 1: { w: 130 }, 2: { w: 90 } },
  };
}

/* Plugin state rides IWorkbookData.resources as {name, data: JSON-string} pairs, one
   entry per Univer plugin. These three payload SHAPES were captured from Univer's own
   facade (createFilter / newConditionalFormattingRule / newDataValidation) rather than
   guessed, then written back here as readable objects — so the demo opens with its
   data features already live instead of needing a scripted setup pass.
   Ranges are 0-based and inclusive; the ops table is rows 2..13, spend col 5, status col 4. */
const OPS_FIRST_ROW = 2;
const OPS_LAST_ROW = OPS_FIRST_ROW + OPS_ROWS.length - 1;
const WORKBOOK_ID = "workbook-spreadsheet-demo";

function seedResources() {
  const filter = {
    "sheet-ops": {
      ref: { startRow: 1, startColumn: 0, endRow: OPS_LAST_ROW, endColumn: 5, rangeType: 0 },
      filterColumns: [],
      cachedFilteredOut: [],
    },
  };
  const conditionalFormatting = {
    "sheet-ops": [
      {
        rule: {
          type: "colorScale",
          config: [
            { index: 0, color: "#E8F3EC", value: { type: "min" } },
            { index: 1, color: "#7FC49A", value: { type: "percentile", value: 50 } },
            { index: 2, color: "#E4A33B", value: { type: "max" } },
          ],
        },
        ranges: [{ startRow: OPS_FIRST_ROW, endRow: OPS_LAST_ROW, startColumn: 5, endColumn: 5 }],
        cfId: "demo-spend-scale",
        stopIfTrue: false,
      },
    ],
  };
  const dataValidation = {
    "sheet-ops": [
      {
        uid: "demo-status-list",
        ranges: [{
          startRow: OPS_FIRST_ROW, startColumn: 4, endRow: OPS_LAST_ROW, endColumn: 4,
          startAbsoluteRefType: 0, endAbsoluteRefType: 0, rangeType: 0,
          unitId: WORKBOOK_ID, sheetId: "sheet-ops",
        }],
        type: "list",
        formula1: JSON.stringify(["On track", "At risk", "Blocked"]),
        showDropDown: true,
        allowBlank: true,
        showErrorMessage: true,
      },
    ],
  };
  return [
    { name: "SHEET_FILTER_PLUGIN", data: JSON.stringify(filter) },
    { name: "SHEET_CONDITIONAL_FORMATTING_PLUGIN", data: JSON.stringify(conditionalFormatting) },
    { name: "SHEET_DATA_VALIDATION_PLUGIN", data: JSON.stringify(dataValidation) },
  ];
}

/* seedWorkbook — the flagship demo AND the deterministic journey fixture. Three
   sheets that make the whole feature set demonstrate itself on load:
     · Budget — a Q1 model: merged bold title, =SUM per row and per column, an
       =AVERAGE row, $ number format, a frozen header row + first column;
     · Ops — a 12-line operating table carrying the DATA features: an autofilter
       over the header range, a colour scale on Spend, and a Status dropdown
       (data validation). Dates render through a date number format;
     · Summary — a live tour of the formula library: SUM/AVERAGE/MAX/COUNTA,
       SUMIF/COUNTIF, VLOOKUP and INDEX+MATCH, IF, TEXT+MIN, UPPER, percentages
       and cross-sheet references into both other sheets.
   The plugin state (filter, conditional formatting, data validation) rides the
   `resources` array — see WORKBOOK_RESOURCES below.
   Row/column indices are 0-based; formulas use A1 notation (row 0 = A1). */
export function seedWorkbook(): IWorkbookData {
  const money = "money";
  const cell = (v: number, s = money) => ({ v, s });
  return {
    id: "workbook-spreadsheet-demo",
    name: "Demo workbook",
    appVersion: "0.25.1",
    locale: EN_US,
    styles: STYLES,
    sheetOrder: ["sheet-budget", "sheet-ops", "sheet-summary", "sheet-notes"],
    sheets: {
      "sheet-budget": {
        id: "sheet-budget",
        name: "Budget",
        tabColor: "",
        hidden: 0,
        rowCount: 200,
        columnCount: 26,
        defaultColumnWidth: 100,
        defaultRowHeight: 24,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        // freeze the title+header rows (ySplit 2) and the Item column (xSplit 1)
        freeze: { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 },
        mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 4 }],
        cellData: {
          0: { 0: { v: "Q1 Budget 2026", s: "title" } },
          1: {
            0: { v: "Item", s: "header" },
            1: { v: "Jan", s: "header" },
            2: { v: "Feb", s: "header" },
            3: { v: "Mar", s: "header" },
            4: { v: "Total", s: "header" },
          },
          2: { 0: { v: "Salaries", s: "label" }, 1: cell(12000), 2: cell(12000), 3: cell(13000), 4: { f: "=SUM(B3:D3)", s: money } },
          3: { 0: { v: "Software", s: "label" }, 1: cell(4000), 2: cell(4200), 3: cell(4200), 4: { f: "=SUM(B4:D4)", s: money } },
          4: { 0: { v: "Marketing", s: "label" }, 1: cell(6000), 2: cell(8000), 3: cell(7000), 4: { f: "=SUM(B5:D5)", s: money } },
          5: { 0: { v: "Travel", s: "label" }, 1: cell(2000), 2: cell(1500), 3: cell(3000), 4: { f: "=SUM(B6:D6)", s: money } },
          6: {
            0: { v: "Total", s: "label" },
            1: { f: "=SUM(B3:B6)", s: "total" },
            2: { f: "=SUM(C3:C6)", s: "total" },
            3: { f: "=SUM(D3:D6)", s: "total" },
            4: { f: "=SUM(E3:E6)", s: "total" },
          },
          7: {
            0: { v: "Average / mo", s: "label" },
            1: { f: "=AVERAGE(B3:B6)", s: "total" },
            2: { f: "=AVERAGE(C3:C6)", s: "total" },
            3: { f: "=AVERAGE(D3:D6)", s: "total" },
            4: { f: "=AVERAGE(E3:E6)", s: "total" },
          },
        },
        rowData: {},
        columnData: { 0: { w: 130 } },
        rowHeader: { width: 46, hidden: 0 },
        columnHeader: { height: 24, hidden: 0 },
        showGridlines: 1,
        selections: ["A1"],
        rightToLeft: 0,
      },
      "sheet-ops": opsSheet(),
      "sheet-summary": summarySheet(),
      "sheet-notes": {
        id: "sheet-notes",
        name: "Notes",
        tabColor: "",
        hidden: 0,
        rowCount: 100,
        columnCount: 26,
        defaultColumnWidth: 120,
        defaultRowHeight: 24,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
        mergeData: [],
        cellData: {
          0: { 0: { v: "Notes", s: "title" } },
          2: { 0: { v: "Q1 total", s: "label" }, 1: { f: "=Budget!E7", s: "money" } },
          3: { 0: { v: "Owner", s: "label" }, 1: { v: "Finance" } },
        },
        rowData: {},
        columnData: { 0: { w: 130 } },
        rowHeader: { width: 46, hidden: 0 },
        columnHeader: { height: 24, hidden: 0 },
        showGridlines: 1,
        selections: ["A1"],
        rightToLeft: 0,
      },
    },
    resources: seedResources(),
  } as unknown as IWorkbookData;
}

/* seedLargeWorkbook — a single sheet of `rows` data rows (+header) for the scale
   journey. A running =SUM in the last column keeps the formula engine on the hot
   path so the 10k proof exercises real work, not just render. */
export function seedLargeWorkbook(rows: number): IWorkbookData {
  const cellData: Record<number, Record<number, unknown>> = {
    0: { 0: { v: "#", s: "header" }, 1: { v: "Name", s: "header" }, 2: { v: "Value", s: "header" }, 3: { v: "Cumulative", s: "header" } },
  };
  for (let r = 1; r <= rows; r++) {
    cellData[r] = {
      0: { v: r },
      1: { v: `Row ${r}` },
      2: { v: (r * 7) % 1000, s: "money" },
      3: { f: r === 1 ? "=C2" : `=D${r + 1}+C${r + 2}`, s: "money" },
    };
  }
  return {
    id: "workbook-spreadsheet-10k",
    name: "Scale workbook",
    appVersion: "0.25.1",
    locale: EN_US,
    styles: STYLES,
    sheetOrder: ["sheet-rows"],
    sheets: {
      "sheet-rows": {
        id: "sheet-rows",
        name: "Rows",
        tabColor: "",
        hidden: 0,
        rowCount: Math.max(rows + 10, 1000),
        columnCount: 26,
        defaultColumnWidth: 110,
        defaultRowHeight: 24,
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 },
        mergeData: [],
        cellData,
        rowData: {},
        columnData: {},
        rowHeader: { width: 46, hidden: 0 },
        columnHeader: { height: 24, hidden: 0 },
        showGridlines: 1,
        selections: ["A1"],
        rightToLeft: 0,
      },
    },
    resources: [],
  } as unknown as IWorkbookData;
}
