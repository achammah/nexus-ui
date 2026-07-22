import type { FieldDef, ObjectConfig, SelectOption } from "../../types";
import { normalizeOption } from "../../types";
import { relationFields } from "./graph";

/* Pure config → flow-view options mapping — no xyflow, no React, no browser:
   node-testable under the starter's journeys/unit/. FlowView reads these
   resolvers for every capability toggle; definition.tsx (eager) reads the label
   maps + relation helpers for its toolbar. Config is the single source for every
   option (the calendar's viewOptions.ts pattern), and every option carries a
   sensible default so the view works out-of-box AND a client can tailor it.

   Two vocabularies meet here: CONFIG-facing names (business-language: which
   layouts, which fields color/shape/group the graph) and the runtime toggles the
   canvas consumes. Everything degrades to a working default when unset. */

/* ---------- layouts ---------- */
export type LayoutMode = "hierarchical" | "force" | "grid";
export const ALL_LAYOUTS: LayoutMode[] = ["hierarchical", "force", "grid"];
export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  hierarchical: "Hierarchy",
  force: "Force",
  grid: "Grid",
};
const isLayout = (v: unknown): v is LayoutMode =>
  typeof v === "string" && (ALL_LAYOUTS as string[]).includes(v);

/* the enabled layout set — a multiSelect array filtered to valid modes,
   order-preserving + de-duplicated; empty/absent → all three */
export const enabledLayouts = (cfg: Record<string, unknown>): LayoutMode[] => {
  const raw = cfg.enabledLayouts;
  if (!Array.isArray(raw)) return ALL_LAYOUTS;
  const seen = new Set<string>();
  const out = raw.filter((v): v is LayoutMode => isLayout(v) && !seen.has(v) && (seen.add(v), true));
  return out.length ? out : ALL_LAYOUTS;
};

/* the initial layout: the configured defaultLayout when enabled, else the first
   enabled layout (never one the picker doesn't offer) */
export const defaultLayout = (
  cfg: Record<string, unknown>,
  enabled: LayoutMode[] = enabledLayouts(cfg),
): LayoutMode => {
  const d = cfg.defaultLayout;
  return isLayout(d) && enabled.includes(d) ? d : enabled[0] ?? "hierarchical";
};

/* the active layout: the user's runtime pick (viewState.flowLayout) when it names
   an enabled layout, else the configured default. Mirrors calendar defaultView. */
export const resolveLayout = (
  cfg: Record<string, unknown>,
  viewState: Record<string, unknown>,
  enabled: LayoutMode[] = enabledLayouts(cfg),
): LayoutMode => {
  const s = viewState.flowLayout;
  return isLayout(s) && enabled.includes(s) ? s : defaultLayout(cfg, enabled);
};

/* ---------- edges ---------- */
export type EdgeStyle = "smoothstep" | "bezier" | "straight" | "step";
export const ALL_EDGE_STYLES: EdgeStyle[] = ["smoothstep", "bezier", "straight", "step"];
export const EDGE_STYLE_LABELS: Record<EdgeStyle, string> = {
  smoothstep: "Smooth step",
  bezier: "Curved",
  straight: "Straight",
  step: "Step",
};
/* xyflow's built-in edge type name for a config edge style (bezier is "default") */
export const edgeTypeName = (s: EdgeStyle): string => (s === "bezier" ? "default" : s);
/* whether the config pins an explicit edge style (else the view picks per layout:
   elbow for a hierarchy, direct straight lines for force/grid) */
export const explicitEdgeStyle = (cfg: Record<string, unknown>): EdgeStyle | null =>
  ALL_EDGE_STYLES.includes(cfg.edgeStyle as EdgeStyle) ? (cfg.edgeStyle as EdgeStyle) : null;
export const resolveEdgeStyle = (cfg: Record<string, unknown>): EdgeStyle => explicitEdgeStyle(cfg) ?? "smoothstep";
/* the xyflow edge type for a layout: an org-chart elbow for the hierarchy, DIRECT
   straight lines for force/grid (never the orthogonal boxes that trace row frames
   when nodes sit at arbitrary positions). A pinned edgeStyle overrides. */
export const edgeTypeFor = (cfg: Record<string, unknown>, layout: LayoutMode): string => {
  const pinned = explicitEdgeStyle(cfg);
  if (pinned) return edgeTypeName(pinned);
  return layout === "hierarchical" ? "smoothstep" : "straight";
};

/* ---------- boolean capability toggles (default ON = full fidelity out-of-box) ---------- */
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);
/* inline-edit a record on its node + resize + create nodes by hand */
export const configHandEdit = (cfg: Record<string, unknown>): boolean => bool(cfg.handEdit, true);
/* draw edges by hand / drag-between-records-to-create-a-relation */
export const configEdgeDraw = (cfg: Record<string, unknown>): boolean => bool(cfg.edgeDraw, true);
/* animated flow-along edges — OFF by default (edges read as solid, deliberate
   lines; the graph-change TRANSITION animation is always on, independent of this) */
export const configAnimated = (cfg: Record<string, unknown>): boolean => bool(cfg.animated, false);
/* collapse/expand grouped subflows */
export const configCollapsibleGroups = (cfg: Record<string, unknown>): boolean =>
  bool(cfg.collapsibleGroups, true);
/* whether the node-detail panel is offered on click (else click → open directly) */
export const configNodeDetail = (cfg: Record<string, unknown>): boolean => bool(cfg.nodeDetail, true);

/* ---------- per-type node shapes + colors ---------- */
/* the shape vocabulary a node can take — one per distinct value of the shape
   field, assigned deterministically by the field's option order (cycling), so a
   client picks the FIELD and every value gets a stable, distinct silhouette. */
export const NODE_SHAPES = ["rounded", "rectangle", "pill", "diamond", "hexagon"] as const;
export type NodeShape = (typeof NODE_SHAPES)[number];

/* the select field a config key names, when it is a live select field of the object */
const selectFieldNamed = (object: ObjectConfig, key: unknown): FieldDef | undefined =>
  typeof key === "string" && key
    ? object.fields.find((f) => f.key === key && f.type === "select" && f.isActive !== false)
    : undefined;

/* the select fields a shape/color/group picker can offer */
export const selectFields = (object: ObjectConfig): FieldDef[] =>
  object.fields.filter((f) => f.type === "select" && f.isActive !== false);

/* color field: the config's nodeColorField when valid, else the object's
   stage/pipeline field, else the first select field (colored cards out-of-box) */
export const resolveColorField = (
  object: ObjectConfig,
  cfg: Record<string, unknown>,
): FieldDef | undefined => {
  const explicit = selectFieldNamed(object, cfg.nodeColorField);
  if (explicit) return explicit;
  if (cfg.nodeColorField === "" ) return undefined; // explicit "none"
  const stage = object.stageField ?? object.pipelineField;
  return selectFieldNamed(object, stage) ?? selectFields(object)[0];
};

/* shape field: the config's nodeShapeField when valid — OFF by default (rectangles
   read cleanest; shapes are an opt-in differentiator) */
export const resolveShapeField = (
  object: ObjectConfig,
  cfg: Record<string, unknown>,
): FieldDef | undefined => selectFieldNamed(object, cfg.nodeShapeField);

/* the option values of a select field, in declared order (shape assignment index) */
const optionOrder = (field: FieldDef): string[] =>
  (field.options ?? []).map((o: SelectOption) => normalizeOption(o).value);

/* a value's shape: its option's position in the field, cycled through the shape
   vocabulary; an unknown value falls to the first shape */
export const shapeForValue = (field: FieldDef, value: unknown): NodeShape => {
  const idx = optionOrder(field).indexOf(String(value ?? ""));
  return NODE_SHAPES[(idx < 0 ? 0 : idx) % NODE_SHAPES.length];
};

/* ---------- grouping (subflows by a field) ---------- */
/* group field: the config's groupField when it is a live select field — grouping
   is OFF by default (a toolbar toggle turns it on for objects that declare one) */
export const resolveGroupField = (
  object: ObjectConfig,
  cfg: Record<string, unknown>,
): FieldDef | undefined => selectFieldNamed(object, cfg.groupField);

/* whether grouping is currently active: the object declares a group field AND the
   runtime toggle (viewState.flowGrouped) is on. Grouping is an opt-in LENS — the
   default view shows the relation topology (hierarchy/force/grid); the toolbar
   toggle folds records into per-value subflows on demand. */
export const isGrouped = (
  object: ObjectConfig,
  cfg: Record<string, unknown>,
  viewState: Record<string, unknown>,
): boolean => {
  if (!resolveGroupField(object, cfg)) return false;
  return viewState.flowGrouped === true;
};

/* ---------- node-detail panel ---------- */
/* the fields the detail panel lists: the config's detailFields when they name live
   fields, else every active field (the relation edges included as read context).
   The primary always leads. */
export const resolveDetailFields = (
  object: ObjectConfig,
  cfg: Record<string, unknown>,
): FieldDef[] => {
  const active = object.fields.filter((f) => f.isActive !== false);
  const raw = cfg.detailFields;
  let picked = active;
  if (Array.isArray(raw)) {
    const keys = raw.filter((k): k is string => typeof k === "string");
    const hit = keys.map((k) => active.find((f) => f.key === k)).filter((f): f is FieldDef => !!f);
    if (hit.length) picked = hit;
  }
  const primary = active.find((f) => f.primary);
  if (primary && !picked.some((f) => f.key === primary.key)) return [primary, ...picked];
  // primary first
  return [...picked].sort((a, b) => Number(b.primary ?? false) - Number(a.primary ?? false));
};

/* the fields editable inline on a node / in the panel — active, non-relation,
   non-primary-locked: text/number/select/date/currency/etc. (relations edit via
   drag-to-relate; primary stays editable as the title) */
export const inlineEditableFields = (object: ObjectConfig): FieldDef[] =>
  object.fields.filter(
    (f) => f.isActive !== false && f.type !== "relation" && f.type !== "json" && f.type !== "array",
  );
