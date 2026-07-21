/* Record-core object model — CONFIG-DRIVEN (the class-engine pattern): every entity an
   app manages is an ObjectConfig row; tables/kanban/record pages render FROM config,
   so a new entity is a config entry, never a fork of a surface. */

export type FieldType =
  | "text" | "number" | "select" | "date" | "currency" | "email" | "url"
  | "relation" | "user" | "multiselect"
  | "boolean" | "longText" | "dateTime" | "rating" | "array" | "json"
  | "money" | "emails" | "phones" | "links" | "address" | "fullName"
  | "richText";

/* richText value = Block[] — the Notion-grade editor's block array, stored as
   JSON in the record store (edits on the record page, truncated preview in tables).
   One-way re-export (NotionEditor imports nothing from here → no cycle). */
export type { Block } from "./NotionEditor";

/* Shaped (composite) field values — CRM-grade structured values. Lists
   (emails/phones/links) are plain string[]. `currency` (a bare number) stays
   untouched; `money` is the shaped alternative carrying its ISO 4217 code. */
export interface MoneyValue { amount: number; code: string }
export interface AddressValue { street?: string; city?: string; postcode?: string; country?: string }
export interface FullNameValue { first?: string; last?: string }

export const isMoneyValue = (v: unknown): v is MoneyValue =>
  typeof v === "object" && v !== null && !Array.isArray(v) && typeof (v as MoneyValue).amount === "number";

/* fields whose value can feed chart measures / kanban rollups */
export const isMeasurable = (f: FieldDef): boolean =>
  f.type === "number" || f.type === "currency" || f.type === "money";

/* the numeric side of a measurable value (money aggregates by its amount) */
export const measurableValue = (v: unknown): number =>
  typeof v === "number" ? v : isMoneyValue(v) ? v.amount : 0;

export const formatMoney = (v: MoneyValue): string => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: v.code, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v.amount);
  } catch {
    // unknown/absent code — still render the amount, never throw mid-table
    return `${new Intl.NumberFormat("en-US").format(v.amount)} ${v.code ?? ""}`.trim();
  }
};

export const joinName = (v: unknown): string => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "";
  const n = v as FullNameValue;
  return [n.first, n.last].filter(Boolean).join(" ");
};

/* cell summary = "street, city"; full = all four parts (CSV, timelines) */
export const addressLine = (v: unknown, full = false): string => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return "";
  const a = v as AddressValue;
  const parts = full ? [a.street, a.city, a.postcode, a.country] : [a.street, a.city];
  return parts.filter(Boolean).join(", ");
};

/* bare host label for link anchors ("https://www.acme.example/x" → "acme.example") */
export const hostLabel = (url: string): string => {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/* Select/multiselect options: plain strings stay valid; the object form adds a
   COLOR that renders consistently on every chip/badge/kanban surface. */
export type SelectOption = string | { value: string; label?: string; color?: OptionColor };
export type OptionColor =
  | "gray" | "blue" | "green" | "yellow" | "orange" | "red" | "purple" | "pink" | "teal";

export const normalizeOption = (o: SelectOption): { value: string; label: string; color?: OptionColor } =>
  typeof o === "string" ? { value: o, label: o } : { value: o.value, label: o.label ?? o.value, color: o.color };

export const optionValues = (options?: SelectOption[]): string[] =>
  (options ?? []).map((o) => normalizeOption(o).value);

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];  // select | multiselect (string or {value,label,color})
  relation?: string;         // relation → object key
  /* relation holds MANY targets (value: id[]) — checkbox picker, one committed diff */
  multiple?: boolean;
  /* POLYMORPHIC relation: may point at any of these object keys (value: {object,id});
     replaces `relation`. Search spans every eligible type. */
  relationTargets?: string[];
  /* names the reverse related-list section on the target object */
  inverseLabel?: string;
  width?: number;            // table col width px
  primary?: boolean;         // the record's display name field
  /* value must be unique across the object's records (409 on conflict) */
  unique?: boolean;
  /* false → hidden from every surface and write-protected, data preserved
     (deactivate-and-restore is the lifecycle lever, not deletion) */
  isActive?: boolean;
  /* rating scale (default 5) */
  scale?: number;
  /* AI-enrichment seam: the platform primitive that computes this field on demand
     (the UI shows a per-row Run affordance; the consumer wires the call). */
  primitive?: { kind: "task" | "workflow"; taskId?: string; id?: string; label?: string };
  /* AI inline-suggestions seam (richText only): the AI task that proposes tracked
     changes for this field. Present → the record page mounts the review surface
     (editor + rail); absent → the field renders as a plain editor. */
  suggestTaskId?: string;
}

export interface ObjectConfig {
  /* how a row click opens records: side-peek over the list (default) or full page */
  openIn?: "peek" | "page";
  /* record-page shape (default "standard"):
     - "standard": the fields panel + timeline/notes/files tabs. A richText field
       spans the full details column and renders cleanly at any width (incl. the peek).
     - "document": a Notion-style full page — the object's primary richText field
       becomes a WIDE hero editor as the main column, and the other fields +
       timeline/notes/files move into a compact sidebar. A "document" object
       defaults to opening in FULL PAGE (set `openIn` to override). */
  recordLayout?: "standard" | "document";
  key: string;               // "companies"
  label: string;             // "Companies"
  labelOne: string;          // "Company"
  icon?: string;             // lucide icon name
  fields: FieldDef[];
  /* default column visibility for the table view: the field keys shown by default
     (the primary field is always shown). Omitted → every non-primary field shows.
     A per-user Columns menu overrides this at runtime (persisted per object). */
  columns?: string[];
  /* field keys fed to the copilot as context when a record of this object is open
     (replaces any hardcoded per-object context). Omitted → the primary field only. */
  contextFields?: string[];
  stageField?: string;       // select field key driving the kanban
  /* select field key whose options form a record state-pipeline (rendered by the
     suggestions surface Pipeline); the record's current value marks the active step */
  pipelineField?: string;
  /* the view tabs this object offers, in order: `type` picks an installed view
     definition (views/<type>/ — see views/registry.ts), the other keys are that
     type's config (its configSchema). Omitted → derived: the table, plus board +
     chart when a select/user field exists. */
  views?: { type: string; [key: string]: unknown }[];
  /* the initially-active view — any installed view type ("table" | "kanban" |
     "chart" built in) */
  defaultView: "table" | "kanban" | (string & {});
  /* rows belong to a team: visibility + roles resolve per the caller's active team */
  teamScoped?: boolean;
  /* role → allowed actions (view/create/edit/delete/export + editOwn/deleteOwn) */
  permissions?: Record<string, string[]>;
}

export interface RecordRow {
  id: string;
  [key: string]: unknown;
}

/* Relation picker option — identity-aware (relations store target IDS; labels are
   projection). `type` = the target OBJECT KEY (poly pickers span several);
   `typeLabel` is its display name for the type tag. */
export interface RelationItem {
  id: string;
  label: string;
  type?: string;
  typeLabel?: string;
}

/* a row's raw relation refs as decorated by the API (`_refs`):
   single = id string · multiple = id[] · polymorphic = {object,id} */
export type RelationRef = string | string[] | { object: string; id: string };
export const rowRefs = (row: RecordRow): Record<string, RelationRef> =>
  (row._refs as Record<string, RelationRef> | undefined) ?? {};

export interface ViewDef {
  id: string;
  object: string;
  name: string;
  kind: "table" | "kanban";
  filters: { field: string; op: "eq" | "neq" | "contains"; value: string }[];
  sort?: { field: string; dir: "asc" | "desc" };
  hiddenFields?: string[];
}

export interface TimelineEvent {
  id: string;
  ts: string;                 // ISO
  kind: "created" | "updated" | "note" | "stage" | "activity" | "file";
  summary: string;
  actor?: string;
  /* activity subkind ("call" | "email" | "meeting") — drives the timeline icon */
  activity?: string;
}

/* Attachment metadata (content stays server-side; download via href). */
export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;               // bytes
  ts: string;                 // ISO
}
