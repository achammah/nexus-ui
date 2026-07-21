import type { FieldDef } from "../../types";
// .ts-extension specifier: this module also runs under plain node (node:test
// strip-types), which resolves no extensionless imports; vite + tsc accept it
// via allowImportingTsExtensions
import { normalizeOption, optionValues } from "../../types.ts";

/* Pure grid cell-mapping core — no glide, no browser: node-testable
   (the starter's journeys/unit/grid-cells.test.ts). SpreadsheetView turns
   these descriptors into real glide cells; paste and fill coercion route
   through coerceFromText so a value a field cannot hold is REJECTED (the
   cell is skipped), never written as garbage. */

/* how the grid treats each field type */
export type GridCellDesc =
  | { kind: "text"; editable: boolean }        // text · longText
  | { kind: "uri"; editable: boolean }         // url · email
  | { kind: "number"; editable: boolean }      // number · currency
  | { kind: "boolean"; editable: boolean }
  | { kind: "select"; editable: boolean }
  | { kind: "multiselect"; editable: boolean }
  | { kind: "user"; editable: boolean }
  | { kind: "readonly" };                      // formatted display only

/* the field types the grid edits in place. Everything else renders formatted
   read-only: dates edit on the record page (the DataTable precedent), relation
   identity belongs to the picker, rich/shaped values to their editors. */
export const isGridEditable = (f: FieldDef): boolean =>
  ["text", "longText", "url", "email", "number", "currency", "boolean", "select", "multiselect", "user"].includes(f.type);

export const cellDescFor = (f: FieldDef): GridCellDesc => {
  // the primary is the frozen identity column — copyable, never grid-edited
  if (f.primary) return { kind: "text", editable: false };
  if (!isGridEditable(f)) return { kind: "readonly" };
  switch (f.type) {
    case "text":
    case "longText": return { kind: "text", editable: true };
    case "url":
    case "email": return { kind: "uri", editable: true };
    case "number":
    case "currency": return { kind: "number", editable: true };
    case "boolean": return { kind: "boolean", editable: true };
    case "select": return { kind: "select", editable: true };
    case "multiselect": return { kind: "multiselect", editable: true };
    case "user": return { kind: "user", editable: true };
    default: return { kind: "readonly" };
  }
};

export type Coerced = { ok: true; value: unknown } | { ok: false };

/* pasted/filled text → a typed field value. Select/multiselect match option
   VALUES or LABELS; user matches the directory exactly; numbers tolerate
   thousands separators. */
export const coerceFromText = (f: FieldDef, text: string, users: string[] = []): Coerced => {
  const t = text.trim();
  switch (f.type) {
    case "text":
    case "longText":
    case "url":
    case "email":
      return { ok: true, value: t };
    case "number":
    case "currency": {
      if (t === "") return { ok: true, value: null };
      const n = Number(t.replaceAll(",", ""));
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
    }
    case "boolean": {
      const low = t.toLowerCase();
      if (["true", "yes", "y", "1"].includes(low)) return { ok: true, value: true };
      if (["false", "no", "n", "0", ""].includes(low)) return { ok: true, value: false };
      return { ok: false };
    }
    case "select": {
      if (t === "") return { ok: true, value: "" };
      const hit = (f.options ?? []).map(normalizeOption).find((o) => o.value === t || o.label === t);
      return hit ? { ok: true, value: hit.value } : { ok: false };
    }
    case "multiselect": {
      if (t === "") return { ok: true, value: [] };
      const parts = t.split(/[;,·]/).map((s) => s.trim()).filter(Boolean);
      const opts = (f.options ?? []).map(normalizeOption);
      const vals: string[] = [];
      for (const p of parts) {
        const hit = opts.find((o) => o.value === p || o.label === p);
        if (!hit) return { ok: false };
        vals.push(hit.value);
      }
      return { ok: true, value: vals };
    }
    case "user": {
      if (t === "") return { ok: true, value: "" };
      return users.includes(t) ? { ok: true, value: t } : { ok: false };
    }
    default:
      return { ok: false };
  }
};

/* the text a copied cell contributes to the TSV buffer — raw values (never
   display formatting) so grid→grid and grid→Excel round-trips are lossless;
   multiselect joins with "; " which coerceFromText splits back */
export const textForCopy = (f: FieldDef, value: unknown): string => {
  if (f.type === "multiselect") return Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return String(value ?? "");
};

/* guard against pathological option sets */
export const knownOptionValues = (f: FieldDef): string[] => optionValues(f.options);
