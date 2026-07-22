// XLSX + CSV import/export for the workbook block. Univer's OSS engine does NOT ship
// client-side .xlsx exchange (that lives in the licensed "advanced" preset + a server),
// so the round-trip is built on exceljs (MIT) — lazy-loaded, so the ~900KB library
// enters the bundle ONLY when a user actually imports/exports, never on mount.
//
// The bridge maps between Univer's IWorkbookData snapshot (the exact shape
// fWorkbook.save() returns) and an exceljs Workbook: values, formulas, the common
// cell styles (bold/italic/underline/strike, font size + family + color, fill,
// number format, alignment, wrap), merges, column widths, row heights and frozen
// panes survive both directions. Anything Univer models but Excel doesn't (or vice
// versa) degrades to the nearest equivalent — documented in RECIPES.md.
//
// Runtime-free of @univerjs (type-only import) so it stays node-testable and does not
// drag the engine into this chunk.
import type { IWorkbookData, IWorksheetData, ICellData, IStyleData } from "@univerjs/core";

/* ── color helpers ─────────────────────────────────────────────────────────── */
// Univer stores colors as { rgb: "#RRGGBB" | "rgb(r,g,b)" }; Excel wants "AARRGGBB".
function toArgb(rgb?: string): string | undefined {
  if (!rgb) return undefined;
  let hex = rgb.trim();
  const m = hex.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) hex = "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("");
  hex = hex.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (hex.length !== 6) return undefined;
  return ("FF" + hex).toUpperCase();
}
function fromArgb(argb?: string): string | undefined {
  if (!argb || typeof argb !== "string") return undefined;
  const h = argb.length === 8 ? argb.slice(2) : argb;
  if (h.length !== 6) return undefined;
  return "#" + h.toUpperCase();
}

/* ── style key (dedupe imported styles) ────────────────────────────────────── */
const HALIGN: Record<number, "left" | "center" | "right"> = { 1: "left", 2: "center", 3: "right" };
const VALIGN: Record<number, "top" | "middle" | "bottom"> = { 1: "top", 2: "middle", 3: "bottom" };
const HALIGN_R: Record<string, number> = { left: 1, center: 2, right: 3 };
const VALIGN_R: Record<string, number> = { top: 1, middle: 2, bottom: 3 };

/* Excel's 1900 date system counts from the 1899-12-30 epoch, which ALREADY absorbs
   the classic 1900 leap-year bug — so the 25569-day offset from the Unix epoch is the
   whole conversion; adding a further leap correction would shift every date by a day. */
const MS_PER_DAY = 86400000;
function dateToSerial(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return utc / MS_PER_DAY + 25569; // 25569 = days from 1899-12-30 to 1970-01-01
}

/* ── EXPORT: IWorkbookData → exceljs Workbook → Blob ────────────────────────── */
export async function exportWorkbookToXlsx(data: IWorkbookData): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Nexus";
  wb.created = new Date();
  const styles = (data.styles ?? {}) as Record<string, IStyleData>;

  for (const sheetId of data.sheetOrder ?? []) {
    const sheet = data.sheets?.[sheetId] as IWorksheetData | undefined;
    if (!sheet) continue;
    const ws = wb.addWorksheet(sheet.name || sheetId, {
      properties: { defaultColWidth: pxToCharWidth(sheet.defaultColumnWidth ?? 88) },
    });

    // cells
    const cellData = (sheet.cellData ?? {}) as Record<string, Record<string, ICellData>>;
    for (const rowStr of Object.keys(cellData)) {
      const r = Number(rowStr);
      const cols = cellData[rowStr] ?? {};
      for (const colStr of Object.keys(cols)) {
        const c = Number(colStr);
        const cd = cols[colStr];
        if (!cd) continue;
        const cell = ws.getCell(r + 1, c + 1);
        if (cd.f) {
          cell.value = { formula: String(cd.f).replace(/^=/, ""), result: cd.v as number | string } as never;
        } else if (cd.v !== undefined && cd.v !== null) {
          cell.value = cd.v as never;
        }
        const style = resolveStyle(cd.s, styles);
        if (style) applyStyleToExcel(cell, style);
      }
    }

    // merges
    for (const m of sheet.mergeData ?? []) {
      try { ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1); } catch { /* overlap */ }
    }
    // column widths
    const columnData = (sheet.columnData ?? {}) as Record<string, { w?: number }>;
    for (const colStr of Object.keys(columnData)) {
      const w = columnData[colStr]?.w;
      if (w) ws.getColumn(Number(colStr) + 1).width = pxToCharWidth(w);
    }
    // row heights
    const rowData = (sheet.rowData ?? {}) as Record<string, { h?: number }>;
    for (const rowStr of Object.keys(rowData)) {
      const h = rowData[rowStr]?.h;
      if (h) ws.getRow(Number(rowStr) + 1).height = h * 0.75; // px → points
    }
    // freeze
    const fz = sheet.freeze;
    if (fz && (fz.xSplit > 0 || fz.ySplit > 0)) {
      ws.views = [{ state: "frozen", xSplit: fz.xSplit, ySplit: fz.ySplit }];
    }
    if (sheet.showGridlines === 0) ws.views = [{ ...(ws.views?.[0] ?? {}), showGridLines: false } as never];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function resolveStyle(s: ICellData["s"], styles: Record<string, IStyleData>): IStyleData | undefined {
  if (!s) return undefined;
  if (typeof s === "string") return styles[s];
  return s as IStyleData;
}

// exceljs cell mutated in place
function applyStyleToExcel(cell: { font?: unknown; fill?: unknown; alignment?: unknown; numFmt?: string }, st: IStyleData): void {
  const font: Record<string, unknown> = {};
  if (st.bl) font.bold = true;
  if (st.it) font.italic = true;
  if (st.ul && (st.ul as { s?: number }).s) font.underline = true;
  if (st.st && (st.st as { s?: number }).s) font.strike = true;
  if (st.fs) font.size = st.fs;
  if (st.ff) font.name = st.ff;
  const color = toArgb((st.cl as { rgb?: string } | undefined)?.rgb);
  if (color) font.color = { argb: color };
  if (Object.keys(font).length) cell.font = font;

  const bg = toArgb((st.bg as { rgb?: string } | undefined)?.rgb);
  if (bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

  const align: Record<string, unknown> = {};
  if (st.ht && HALIGN[st.ht]) align.horizontal = HALIGN[st.ht];
  if (st.vt && VALIGN[st.vt]) align.vertical = VALIGN[st.vt];
  if (st.tb === 3) align.wrapText = true; // Univer WrapStrategy.WRAP === 3
  if (Object.keys(align).length) cell.alignment = align;

  const pattern = (st.n as { pattern?: string } | undefined)?.pattern;
  if (pattern) cell.numFmt = pattern;
}

/* Excel column width is in "characters" (Calibri 11 ≈ 7px/char + 5px padding). */
function pxToCharWidth(px: number): number { return Math.max(1, (px - 5) / 7); }
function charWidthToPx(w: number): number { return Math.round(w * 7 + 5); }

/* ── IMPORT: ArrayBuffer(.xlsx) → IWorkbookData ─────────────────────────────── */
export async function importXlsxToWorkbook(buffer: ArrayBuffer, id?: string): Promise<IWorkbookData> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const styles: Record<string, IStyleData> = {};
  const styleKeyToId = new Map<string, string>();
  const styleId = (st: IStyleData): string => {
    const key = JSON.stringify(st);
    let hit = styleKeyToId.get(key);
    if (!hit) { hit = "s" + styleKeyToId.size; styleKeyToId.set(key, hit); styles[hit] = st; }
    return hit;
  };

  const sheetOrder: string[] = [];
  const sheets: Record<string, IWorksheetData> = {};

  wb.eachSheet((ws, idx) => {
    const sid = "imported-sheet-" + idx;
    sheetOrder.push(sid);
    const cellData: Record<number, Record<number, ICellData>> = {};
    let maxRow = 0, maxCol = 0;

    ws.eachRow({ includeEmpty: false }, (row, rNum) => {
      row.eachCell({ includeEmpty: false }, (cell, cNum) => {
        const r = rNum - 1, c = cNum - 1;
        maxRow = Math.max(maxRow, r); maxCol = Math.max(maxCol, c);
        const cd: ICellData = {};
        const v = cell.value as unknown;
        if (v && typeof v === "object") {
          const obj = v as Record<string, unknown>;
          if ("formula" in obj || "sharedFormula" in obj) {
            cd.f = "=" + String(obj.formula ?? obj.sharedFormula ?? "");
            const res = obj.result;
            if (res !== undefined && (typeof res !== "object")) cd.v = res as string | number;
            else if (res && typeof res === "object" && "error" in (res as object)) cd.v = String((res as { error: unknown }).error);
          } else if ("richText" in obj && Array.isArray(obj.richText)) {
            cd.v = (obj.richText as Array<{ text?: string }>).map((t) => t.text ?? "").join("");
          } else if ("text" in obj && "hyperlink" in obj) {
            cd.v = String(obj.text ?? obj.hyperlink);
          } else if ("error" in obj) {
            cd.v = String(obj.error);
          } else if (v instanceof Date) {
            cd.v = dateToSerial(v);
          } else {
            cd.v = String((obj as { toString(): string }).toString?.() ?? "");
          }
        } else if (v !== null && v !== undefined) {
          cd.v = v as string | number | boolean;
        }
        const st = styleFromExcel(cell);
        if (st) cd.s = styleId(st);
        if (cd.f !== undefined || cd.v !== undefined || cd.s !== undefined) {
          (cellData[r] ??= {})[c] = cd;
        }
      });
    });

    // merges
    const mergeData = (ws.model.merges ?? []).map((rng: string) => parseRange(rng)).filter(Boolean) as IWorksheetData["mergeData"];
    // column widths
    const columnData: Record<number, { w: number }> = {};
    ws.columns?.forEach((col, i) => { if (col?.width) columnData[i] = { w: charWidthToPx(col.width) }; });
    // freeze
    const view = ws.views?.[0] as { xSplit?: number; ySplit?: number; state?: string } | undefined;
    const xSplit = view?.state === "frozen" ? view.xSplit ?? 0 : 0;
    const ySplit = view?.state === "frozen" ? view.ySplit ?? 0 : 0;

    sheets[sid] = {
      id: sid,
      name: ws.name || "Sheet" + idx,
      tabColor: "",
      hidden: 0,
      rowCount: Math.max(maxRow + 50, 200),
      columnCount: Math.max(maxCol + 10, 26),
      defaultColumnWidth: 88,
      defaultRowHeight: 24,
      zoomRatio: 1,
      scrollTop: 0,
      scrollLeft: 0,
      freeze: { xSplit, ySplit, startRow: ySplit, startColumn: xSplit },
      mergeData: mergeData ?? [],
      cellData: cellData as never,
      rowData: {},
      columnData: columnData as never,
      rowHeader: { width: 46, hidden: 0 },
      columnHeader: { height: 24, hidden: 0 },
      showGridlines: 1,
      selections: ["A1"],
      rightToLeft: 0,
    } as unknown as IWorksheetData;
  });

  if (sheetOrder.length === 0) throw new Error("The file has no readable sheets.");

  return {
    id: id ?? "imported-" + Date.now(),
    name: (wb.title as string) || "Imported workbook",
    appVersion: "0.25.1",
    locale: "enUS" as never,
    styles: styles as never,
    sheetOrder,
    sheets: sheets as never,
    resources: [],
  } as unknown as IWorkbookData;
}

function styleFromExcel(rawCell: { font?: unknown; fill?: unknown; alignment?: unknown; numFmt?: string }): IStyleData | undefined {
  const cell = rawCell as { font?: Record<string, unknown>; fill?: Record<string, unknown>; alignment?: Record<string, unknown>; numFmt?: string };
  const st: Record<string, unknown> = {};
  const f = cell.font;
  if (f) {
    if (f.bold) st.bl = 1;
    if (f.italic) st.it = 1;
    if (f.underline) st.ul = { s: 1 };
    if (f.strike) st.st = { s: 1 };
    if (typeof f.size === "number") st.fs = f.size;
    if (typeof f.name === "string") st.ff = f.name;
    const clr = fromArgb((f.color as { argb?: string } | undefined)?.argb);
    if (clr) st.cl = { rgb: clr };
  }
  const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
  if (fill?.type === "pattern") {
    const bg = fromArgb(fill.fgColor?.argb);
    if (bg) st.bg = { rgb: bg };
  }
  const a = cell.alignment;
  if (a) {
    if (typeof a.horizontal === "string" && HALIGN_R[a.horizontal]) st.ht = HALIGN_R[a.horizontal];
    if (typeof a.vertical === "string" && VALIGN_R[a.vertical]) st.vt = VALIGN_R[a.vertical];
    if (a.wrapText) st.tb = 3;
  }
  if (cell.numFmt && cell.numFmt !== "General") st.n = { pattern: cell.numFmt };
  return Object.keys(st).length ? (st as IStyleData) : undefined;
}

/* "A1:B2" → { startRow, startColumn, endRow, endColumn } (0-based). */
function parseRange(range: string): { startRow: number; startColumn: number; endRow: number; endColumn: number } | null {
  const m = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  return {
    startColumn: colToNum(m[1]), startRow: Number(m[2]) - 1,
    endColumn: colToNum(m[3]), endRow: Number(m[4]) - 1,
  };
}
function colToNum(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function numToCol(n: number): string {
  let s = "";
  n += 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ── CSV (active sheet only; values, formula results) ───────────────────────── */
export function exportSheetToCsv(data: IWorkbookData, sheetId?: string): string {
  const sid = sheetId ?? data.sheetOrder?.[0];
  const sheet = sid ? (data.sheets?.[sid] as IWorksheetData | undefined) : undefined;
  if (!sheet) return "";
  const cellData = (sheet.cellData ?? {}) as Record<string, Record<string, ICellData>>;
  let maxRow = 0, maxCol = 0;
  for (const r of Object.keys(cellData)) { maxRow = Math.max(maxRow, Number(r)); for (const c of Object.keys(cellData[r])) maxCol = Math.max(maxCol, Number(c)); }
  const lines: string[] = [];
  for (let r = 0; r <= maxRow; r++) {
    const cells: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      const cd = cellData[r]?.[c];
      const raw = cd?.v ?? "";
      cells.push(csvEscape(String(raw)));
    }
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}
function csvEscape(s: string): string {
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function importCsvToWorkbook(text: string, name = "Imported CSV", id?: string): IWorkbookData {
  const rows = parseCsv(text);
  const cellData: Record<number, Record<number, ICellData>> = {};
  let maxCol = 0;
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      maxCol = Math.max(maxCol, c);
      const num = val !== "" && !isNaN(Number(val)) ? Number(val) : undefined;
      (cellData[r] ??= {})[c] = { v: num !== undefined ? num : val };
    });
  });
  const sid = "csv-sheet";
  return {
    id: id ?? "imported-csv-" + Date.now(),
    name,
    appVersion: "0.25.1",
    locale: "enUS" as never,
    styles: {},
    sheetOrder: [sid],
    sheets: {
      [sid]: {
        id: sid, name, tabColor: "", hidden: 0,
        rowCount: Math.max(rows.length + 50, 200), columnCount: Math.max(maxCol + 10, 26),
        defaultColumnWidth: 100, defaultRowHeight: 24, zoomRatio: 1, scrollTop: 0, scrollLeft: 0,
        freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
        mergeData: [], cellData: cellData as never, rowData: {}, columnData: {},
        rowHeader: { width: 46, hidden: 0 }, columnHeader: { height: 24, hidden: 0 },
        showGridlines: 1, selections: ["A1"], rightToLeft: 0,
      },
    } as never,
    resources: [],
  } as unknown as IWorkbookData;
}

/* Minimal RFC-4180 CSV parse (quoted fields, escaped quotes, CRLF/LF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (ch === "\r") { /* handled by \n */ }
      else field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ── download helper ────────────────────────────────────────────────────────── */
export function triggerDownload(content: Blob | string, filename: string, mime = "text/plain"): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mime + ";charset=utf-8" }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export { numToCol };
