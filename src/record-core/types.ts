/* Record-core object model — CONFIG-DRIVEN (the class-engine pattern): every entity an
   app manages is an ObjectConfig row; tables/kanban/record pages render FROM config,
   so a new entity is a config entry, never a fork of a surface. */

export type FieldType = "text" | "number" | "select" | "date" | "currency" | "email" | "url" | "relation";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];        // select
  relation?: string;         // relation → object key
  width?: number;            // table col width px
  primary?: boolean;         // the record's display name field
}

export interface ObjectConfig {
  key: string;               // "companies"
  label: string;             // "Companies"
  labelOne: string;          // "Company"
  icon?: string;             // lucide icon name
  fields: FieldDef[];
  stageField?: string;       // select field key driving the kanban
  defaultView: "table" | "kanban";
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
  kind: "created" | "updated" | "note" | "stage" | "activity";
  summary: string;
  actor?: string;
}
