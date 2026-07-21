import type { FieldDef, RecordRow } from "../../types";

/* Pure gallery data helpers (no React/DOM) so node:test covers cover resolution
   and row grouping — the layout-affecting logic that must stay deterministic. */

/* cover url from a url field, or the first non-empty value of a links/array
   field (the "first image in a field") */
export const coverUrlOf = (row: RecordRow, coverField?: FieldDef): string => {
  if (!coverField) return "";
  let v: unknown = row[coverField.key];
  if (Array.isArray(v)) v = v.find((x) => typeof x === "string" && x.trim() !== "");
  const s = String(v ?? "").trim();
  if (!s) return "";
  return /^(https?:|data:)/i.test(s) ? s : `https://${s}`;
};

export type Group = { value: string; label: string; color?: string; rows: RecordRow[] };

/* partition rows into groups by a select/user field, in the field's own option
   (or the users) order, with a trailing "(Empty)" bucket; empty groups drop */
export const buildGroups = (rows: RecordRow[], gf: FieldDef, users: string[]): Group[] => {
  const opts: Group[] =
    gf.type === "user"
      ? users.map((u) => ({ value: u, label: u, rows: [] }))
      : (gf.options ?? []).map((o) =>
          typeof o === "string"
            ? { value: o, label: o, rows: [] }
            : { value: String(o.value), label: String(o.value), color: o.color, rows: [] },
        );
  const known = new Set(opts.map((o) => o.value));
  const empty: Group = { value: "", label: "(Empty)", rows: [] };
  const byKey = new Map<string, Group>(opts.map((o) => [o.value, o]));
  for (const r of rows) {
    const v = r[gf.key];
    const g = typeof v === "string" && known.has(v) ? byKey.get(v)! : empty;
    g.rows.push(r);
  }
  return [...opts, empty].filter((g) => g.rows.length > 0);
};
