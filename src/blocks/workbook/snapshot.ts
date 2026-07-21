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
};

/* seedWorkbook — the flagship demo AND the deterministic journey fixture: a small
   Q1 budget that proves full spreadsheet power on load —
     · live formulas: per-row =SUM across the month columns, a column =SUM total,
       an =AVERAGE row, and a cross-sheet =Budget!E7 reference on sheet 2;
     · multiple columns (Item + 3 months + Total) you can insert around;
     · formatting: a merged bold title, bold headers, and $ number format;
     · a frozen header row + first column.
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
    sheetOrder: ["sheet-budget", "sheet-notes"],
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
    resources: [],
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
