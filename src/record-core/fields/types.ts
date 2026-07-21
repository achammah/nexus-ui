import type * as React from "react";
import type { FieldDef, RecordRow } from "../types";

/* Field-type contract — a field type is a FOLDER (fields/<type>/definition.{ts,tsx})
   whose default export is a FieldTypeDefinition; the registry picks it up at build
   time (see ./registry.ts). Hosts (RecordPage, DataTable, KanbanBoard, Filters)
   consult the registry BEFORE their built-in type switches, so a new field type is
   a dropped folder, never a switch edit. The built-in types stay in the switches
   today; migrating them into definitions is the editor-unification's additive
   follow-up. Every slot is optional — an entry fills only the surfaces it owns. */

/* Record-page render surface (inline edit or a full canvas/editor). */
export interface FieldRenderProps {
  field: FieldDef;
  row: RecordRow;
  value: unknown;
  /* permission-driven: render a read-only surface, never editors */
  readOnly?: boolean;
  /* persist ONE whole-value patch through the record store — the only write path */
  onSave: (value: unknown) => void;
}

/* Read-only list-surface cell (table cell, kanban card meta, grid/gallery later). */
export interface FieldCellProps {
  field: FieldDef;
  row: RecordRow;
  value: unknown;
}

/* Draft editor for create-dialog / form / wizard surfaces (controlled value;
   commit semantics belong to the host). Filled by the editor unification. */
export interface FieldDraftProps {
  field: FieldDef;
  /* surface-prefixed testid key ("new-city", "form-city"); defaults to field.key */
  fieldKey?: string;
  value: unknown;
  onChange: (value: unknown) => void;
  autoFocus?: boolean;
  /* the app users directory — user-type drafts pick from it */
  users?: string[];
  /* host-surfaced validation message for this field */
  error?: string | null;
}

export interface FieldTypeDefinition {
  /* the `type` string config uses */
  type: string;

  /* ---- render side ---- */
  /* record-page surface; React.lazy for heavy renders (the host wraps the
     registry branch in Suspense with a designed loading state) */
  render?: React.ComponentType<FieldRenderProps>;
  /* list cell; omitted → hosts fall back to previewText, then their defaults */
  cell?: React.ComponentType<FieldCellProps>;
  /* one-line plain text for formatCell / csvCell / palette surfaces */
  previewText?: (value: unknown) => string;
  /* "block" → full-width record-page breakout (the richText treatment) */
  layout?: "inline" | "block";
  /* false → excluded from the FilterBar field list (no meaningful operator set) */
  filterable?: boolean;
  /* false → the keyboard grid's type-to-edit skips it (explicit false only) */
  keyboardEditable?: boolean;
  /* Backspace-clear value on the keyboard grid; undefined → not clearable */
  clearValue?: unknown;

  /* ---- editor side (create/form/import surfaces) ---- */
  Draft?: React.ComponentType<FieldDraftProps>;
  /* raw input (CSV cell, form string) → typed value */
  coerce?: (raw: unknown, field: FieldDef) => unknown;
  /* client-side shape check; a message renders the host's graceful invalid state */
  validate?: (value: unknown, field: FieldDef) => string | null;
}
