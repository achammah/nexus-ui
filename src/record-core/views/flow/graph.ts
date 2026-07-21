import type { FieldDef, ObjectConfig, RecordRow, RelationRef } from "../../types";

/* Flow-view graph core — PURE derivations (no React, no layout dependency):
   node-testable under the starter's journeys/unit/, and safe for the eager
   definition/toolbar to import without pulling the canvas chunk. Rows arrive
   already searched + filtered (ViewProps contract — a view never re-filters);
   edges derive from the relation field's `_refs` id decoration, never from
   projected label text. Like views/resolve.ts, every import here is type-only
   (the one runtime helper mirrors types.ts rowRefs inline) so node's test
   runner can load the module without a bundler. */

/* inline twin of types.ts rowRefs — keeps this module free of runtime imports */
const refsOf = (row: RecordRow): Record<string, RelationRef> =>
  (row._refs as Record<string, RelationRef> | undefined) ?? {};

/* nodes: a record card per row, plus a compact HUB per distinct cross-object
   target (the deal-web shape — the target's records are not in `rows`, so it
   renders as a label chip derived from _refs + the projected value) */
export interface FlowRecordNode { kind: "record"; id: string; row: RecordRow }
export interface FlowHubNode { kind: "hub"; id: string; targetObject: string; targetId: string; label: string; count: number }
export type FlowGraphNode = FlowRecordNode | FlowHubNode;
export interface FlowGraphEdge { id: string; source: string; target: string }
export interface XY { x: number; y: number }

/* the fields a flow view can draw edges from. isActive filter inlined (rather
   than options.tsx's activeFields) so this module stays JSX-free for node:test */
export const relationFields = (object: ObjectConfig): FieldDef[] =>
  object.fields.filter((f) => f.type === "relation" && f.isActive !== false);

/* Resolve the ACTIVE relation: the user's runtime pick (viewState.flowRel), else
   the instance config (viewConfig.relationField), else the object's first
   relation field — skipping any candidate that no longer names a live relation
   (a stale persisted pick falls through). Mirrors views/group.ts resolveGroupBy. */
export const resolveRelation = (
  object: ObjectConfig,
  viewConfig: Record<string, unknown>,
  viewState: Record<string, unknown>,
): string => {
  const rels = relationFields(object);
  const candidates = [viewState.flowRel, viewConfig.relationField, rels[0]?.key];
  for (const c of candidates) {
    if (typeof c === "string" && rels.some((f) => f.key === c)) return c;
  }
  return "";
};

/* the node card's title field: viewConfig.labelField when it names a live field,
   else the object's primary */
export const resolveLabelField = (object: ObjectConfig, viewConfig: Record<string, unknown>): FieldDef => {
  const k = viewConfig.labelField;
  const hit = typeof k === "string" ? object.fields.find((f) => f.key === k && f.isActive !== false) : undefined;
  return hit ?? object.fields.find((f) => f.primary) ?? object.fields[0];
};

/* the card's meta line: up to 2 fields, kanban-card style — first non-primary
   active fields, excluding the active relation (its value IS the edge) */
export const cardMetaFields = (object: ObjectConfig, relationKey: string): FieldDef[] =>
  object.fields.filter((f) => f.isActive !== false && !f.primary && f.key !== relationKey).slice(0, 2);

/* hub node ids are namespaced so they can never collide with row ids */
export const hubId = (targetObject: string, targetId: string) => `hub:${targetObject}:${targetId}`;

/* Derive the graph from one relation field's refs:
   - a SELF entry (target object == this object) pointing INSIDE the current row
     set draws a parent→child record edge (the target ranks as the parent, so an
     org chart lays managers above reports); targets outside the set (filtered,
     trashed, dangling) draw nothing;
   - a CROSS-OBJECT or polymorphic entry draws a hub node + a hub→record edge;
   - a dangling LABEL (no _refs entry) identifies nothing and draws nothing. */
export const buildGraph = (
  object: ObjectConfig,
  rows: RecordRow[],
  relationKey: string,
): { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } => {
  const nodes: FlowGraphNode[] = rows.map((r) => ({ kind: "record", id: String(r.id), row: r }));
  const field = object.fields.find((f) => f.key === relationKey);
  if (!field) return { nodes, edges: [] };
  const inSet = new Set(nodes.map((n) => n.id));
  const defaultTarget = field.relation ?? field.relationTargets?.[0] ?? "";
  const hubs = new Map<string, FlowHubNode>();
  const edges: FlowGraphEdge[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const ref = refsOf(row)[relationKey];
    if (ref === undefined || ref === null) continue;
    const entries = Array.isArray(ref) ? ref : [ref];
    const labels = row[relationKey];
    entries.forEach((entry, i) => {
      const isObj = typeof entry === "object" && entry !== null;
      const tId = String(isObj ? (entry as { id: string }).id : entry);
      const tObj = isObj ? (entry as { object: string }).object : defaultTarget;
      if (!tId || !tObj) return;
      if (tObj === object.key) {
        const rowId = String(row.id);
        if (!inSet.has(tId) || tId === rowId) return; // outside the filtered set / self-loop
        const id = `e-${tId}-${rowId}`;
        if (!seen.has(id)) {
          seen.add(id);
          edges.push({ id, source: tId, target: rowId });
        }
        return;
      }
      const hid = hubId(tObj, tId);
      const id = `e-${hid}-${row.id}`;
      if (seen.has(id)) return;
      seen.add(id);
      const label = String((Array.isArray(labels) ? labels[i] : labels) ?? tId) || tId;
      const hub = hubs.get(hid) ?? { kind: "hub" as const, id: hid, targetObject: tObj, targetId: tId, label, count: 0 };
      hub.count += 1;
      hubs.set(hid, hub);
      edges.push({ id, source: hid, target: String(row.id) });
    });
  }
  return { nodes: [...nodes, ...hubs.values()], edges };
};

/* ---- drag-position persistence (the flowPos viewState key) ----
   Positions are scoped PER RELATION (switching the edge source re-lays out
   instead of mixing stale pins) and hold ONLY dragged nodes — un-dragged nodes
   take the auto layout each mount, which keeps the persisted bag small even on
   very large objects. */
export const positionsFor = (viewState: Record<string, unknown>, relationKey: string): Record<string, XY> => {
  const all = viewState.flowPos as Record<string, Record<string, XY>> | undefined;
  const m = all && typeof all === "object" ? all[relationKey] : undefined;
  return m && typeof m === "object" ? m : {};
};

/* the viewState patch committing one drag stop (possibly a multi-node drag) */
export const positionsPatch = (
  viewState: Record<string, unknown>,
  relationKey: string,
  moved: Record<string, XY>,
): Record<string, unknown> => {
  const all = (viewState.flowPos as Record<string, Record<string, XY>> | undefined) ?? {};
  return { flowPos: { ...all, [relationKey]: { ...(all[relationKey] ?? {}), ...moved } } };
};
