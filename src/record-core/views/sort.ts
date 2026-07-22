import type { FieldDef, ObjectConfig, RecordRow } from "../types";

/* Shared, type-aware, STABLE row sort for the view layer. Gallery consumes it
   today; any view can adopt it (the table keeps its own TanStack sort model for
   multi-column/shift-click — unifying that is a follow-up, not worth a table
   regression here). Blanks sort LAST regardless of direction (the Airtable
   convention); equal keys keep their original order (stable via index). */

export type SortDir = "asc" | "desc";

/* Resolve the ACTIVE sort: the runtime pick (viewState.sortField, "" = an
   explicit None) else the instance config (viewConfig.sortField), skipping a
   key that no longer names a sortable field. */
export const resolveSort = (
  object: ObjectConfig,
  viewConfig: Record<string, unknown>,
  viewState: Record<string, unknown>,
): { key: string; dir: SortDir } => {
  // the SortMenu only offers sortable fields and validateConfig gates the config,
  // so a light exists+active check keeps this module pure (no group/options import)
  const raw = viewState.sortField !== undefined ? viewState.sortField : viewConfig.sortField;
  const key = typeof raw === "string" && object.fields.some((f) => f.key === raw && f.isActive !== false) ? raw : "";
  const dirRaw = viewState.sortDir !== undefined ? viewState.sortDir : viewConfig.sortDir;
  return { key, dir: dirRaw === "desc" ? "desc" : "asc" };
};

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === "";

const moneyAmount = (v: unknown): number => {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Number(o.amount ?? o.value ?? 0);
  }
  return Number(v);
};

/* Compare two NON-empty values of a field by its type. */
export const compareByField = (a: RecordRow, b: RecordRow, field: FieldDef): number => {
  const av = a[field.key];
  const bv = b[field.key];
  switch (field.type) {
    case "number":
    case "currency":
    case "rating":
      return Number(av) - Number(bv);
    case "money":
      return moneyAmount(av) - moneyAmount(bv);
    case "boolean":
      return (av ? 1 : 0) - (bv ? 1 : 0);
    case "date":
    case "dateTime":
      // stored ISO strings sort lexically = chronologically
      return String(av).localeCompare(String(bv));
    default:
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  }
};

/* A new array of rows sorted by one field. `field` undefined → unchanged order. */
export const sortRows = (rows: RecordRow[], field: FieldDef | undefined, dir: SortDir): RecordRow[] => {
  if (!field) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return rows
    .map((r, i) => [r, i] as const)
    .sort(([a, ai], [b, bi]) => {
      const ae = isEmpty(a[field.key]);
      const be = isEmpty(b[field.key]);
      if (ae && be) return ai - bi;
      if (ae) return 1; // blanks last
      if (be) return -1;
      const c = compareByField(a, b, field);
      return c !== 0 ? c * sign : ai - bi;
    })
    .map(([r]) => r);
};
