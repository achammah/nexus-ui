import type * as React from "react";
import type { ObjectConfig, RecordRow } from "../types";

/* View-type contract — a view is a FOLDER (views/<type>/definition.tsx) whose
   default export is a ViewDefinition; the registry picks it up at build time
   (see ./registry.ts). Consumers render views exclusively through the registry,
   so a new view type is a dropped folder, never a switcher edit. */

/* One configured view on an object (ObjectConfig.views entry): `type` picks the
   registered definition; every other key is that type's config (the definition's
   configSchema documents them). */
export interface ViewInstanceConfig {
  type: string;
  [key: string]: unknown;
}

/* Props every view component receives from the hosting list surface. */
export interface ViewProps {
  object: ObjectConfig;
  /* rows AFTER search + filters — a view never re-filters */
  rows: RecordRow[];
  /* the app users directory (group-by-user columns, assignee cells) */
  users: string[];
  /* permission-driven: true → render without editors/drag */
  readOnly: boolean;
  /* this view instance's config: the object's `views` entry merged over the
     definition's defaultConfig */
  viewConfig: Record<string, unknown>;
  /* the object's persisted view-state bag. Views read/write their OWN keys
     (table: hidden/sort · kanban: groupBy/aggregate · chart: groupBy/measure);
     two views naming the same key deliberately share it (board + chart share
     groupBy). The host persists the bag and captures it in saved views. */
  viewState: Record<string, unknown>;
  /* merge a partial into the bag */
  onViewState: (patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  onPeek: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  /* open the host's create DIALOG, optionally seeded (the calendar passes the
     clicked day's date) — the user reviews and confirms. The host supplies it
     only when the caller may create — absent → the view hides its create
     affordances. Distinct from a direct-create seam: this never writes itself. */
  onCreateDraft?: (prefill?: Record<string, unknown>) => void;
  /* bulk-selection state (the host renders the bulk bar); views without row
     selection ignore both */
  selection: Record<string, boolean>;
  onSelectionChange: (sel: Record<string, boolean>) => void;
  /* create a record through the host's store path (form-style views submit with
     it). Absent when the caller lacks the create permission — such views render
     a designed no-permission state instead of a dead submit. */
  onCreate?: (body: Record<string, unknown>) => Promise<RecordRow>;
}

/* Props for a definition's optional view-bar controls. The host renders the
   active view's Toolbar twice per bar: side="lead" left of the view switcher
   (the table's Columns menu), side="trail" right of it (group-by / measure /
   rollup) — return null on the side you don't use. */
export interface ViewToolbarProps {
  object: ObjectConfig;
  users: string[];
  viewConfig: Record<string, unknown>;
  viewState: Record<string, unknown>;
  onViewState: (patch: Record<string, unknown>) => void;
  side: "lead" | "trail";
}

/* Declarative schema of a view type's config keys — powers docs and config
   UIs; validateConfig stays the runtime gate. */
export interface ViewConfigField {
  key: string;
  label: string;
  kind: "field" | "select" | "text" | "number" | "boolean";
  /* kind "field": restrict the pickable field types */
  fieldTypes?: string[];
  /* kind "select": the fixed option set */
  options?: string[];
  required?: boolean;
}

export interface ViewDefinition {
  /* the `type` string config uses ("table" | "kanban" | "chart" | …) */
  type: string;
  /* switcher tab label ("Table", "Board", "Chart") */
  label: string;
  icon: React.ReactNode;
  /* the view surface; React.lazy for heavy views (the host wraps rendering in
     Suspense). The built-in three stay statically imported — they are in the
     main chunk regardless and must render without a fallback frame. */
  component: React.ComponentType<ViewProps>;
  /* optional view-bar controls (see ViewToolbarProps) */
  Toolbar?: React.ComponentType<ViewToolbarProps>;
  /* declarative config-key schema for this view type's `views` entries */
  configSchema?: ViewConfigField[];
  /* derive this type's default viewConfig for an object (used when the object
     declares no `views` and for keys the entry leaves unset) */
  defaultConfig?: (object: ObjectConfig) => Record<string, unknown>;
  /* validate a configured instance; a returned message renders in place of the
     view as a graceful chip, never a crash */
  validateConfig?: (object: ObjectConfig, cfg: Record<string, unknown>) => string | null;
}
