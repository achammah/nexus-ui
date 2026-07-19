/* Record-core object model — CONFIG-DRIVEN (the class-engine pattern): every entity an
   app manages is an ObjectConfig row; tables/kanban/record pages render FROM config,
   so a new entity is a config entry, never a fork of a surface. */

export type FieldType =
  | "text" | "number" | "select" | "date" | "currency" | "email" | "url"
  | "relation" | "user" | "multiselect"
  | "boolean" | "longText" | "dateTime" | "rating" | "array" | "json";

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
  primitive?: { kind: "task" | "workflow"; id?: string; label?: string };
}

export interface ObjectConfig {
  key: string;               // "companies"
  label: string;             // "Companies"
  labelOne: string;          // "Company"
  icon?: string;             // lucide icon name
  fields: FieldDef[];
  stageField?: string;       // select field key driving the kanban
  defaultView: "table" | "kanban";
  /* rows belong to a team: visibility + roles resolve per the caller's active team */
  teamScoped?: boolean;
  /* role → allowed actions (view/create/edit/delete/export + editOwn/deleteOwn) */
  permissions?: Record<string, string[]>;
}

export interface RecordRow {
  id: string;
  [key: string]: unknown;
}

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
