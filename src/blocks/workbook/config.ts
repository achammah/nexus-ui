// The workbook block is CONFIG-COMPOSABLE: one WorkbookConfig gates which Excel
// capabilities a company's surface carries. A simple grid dials everything off; a
// full financial model dials everything on. Every feature maps to a Univer preset
// (wired) or a built toolbar action (import/export), and the defaults give a
// full-featured sheet out of the box. This module is runtime-free of @univerjs
// (plain data) so it stays in the eager bundle and is node-testable.

export interface WorkbookConfig {
  /* column autofilter — dropdown filter chips on a header row (Univer filter preset) */
  filters: boolean;
  /* range sort, ascending/descending, custom (Univer sort preset) */
  sort: boolean;
  /* conditional formatting — color scales, data bars, highlight rules (Univer CF preset) */
  conditionalFormatting: boolean;
  /* data validation — dropdown lists, number/date ranges, checkboxes (Univer DV preset) */
  dataValidation: boolean;
  /* find & replace across the workbook (Univer find-replace preset) */
  findReplace: boolean;
  /* cell notes / comments (Univer note preset) */
  notes: boolean;
  /* XLSX + CSV import and export — inbound file load + file download, as toolbar
     actions in the workbook's own toolbar band (built on exceljs, lazy-loaded) */
  importExport: boolean;
}

/* Full-Excel defaults: everything a spreadsheet user expects is on. A company
   narrows from here (e.g. a read-mostly report dials off dataValidation + notes). */
export const DEFAULT_WORKBOOK_CONFIG: WorkbookConfig = {
  filters: true,
  sort: true,
  conditionalFormatting: true,
  dataValidation: true,
  findReplace: true,
  notes: true,
  importExport: true,
};

/* A minimal grid: formula engine + core editing only, no data tooling, no I/O.
   Handy preset for a lightweight embedded sheet ("just a grid for any company"). */
export const MINIMAL_WORKBOOK_CONFIG: WorkbookConfig = {
  filters: false,
  sort: false,
  conditionalFormatting: false,
  dataValidation: false,
  findReplace: false,
  notes: false,
  importExport: false,
};

/* Merge a partial config over the full-Excel defaults. Passing `false`/`true` for
   any single key flips just that feature; omitted keys keep the default. */
export function resolveWorkbookConfig(partial?: Partial<WorkbookConfig> | null): WorkbookConfig {
  return { ...DEFAULT_WORKBOOK_CONFIG, ...(partial ?? {}) };
}
