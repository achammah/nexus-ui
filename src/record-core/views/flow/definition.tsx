import * as React from "react";
import { Network } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { relationFields, resolveRelation } from "./graph";
import { ALL_EDGE_STYLES, ALL_LAYOUTS, selectFields } from "./flowConfig";

/* Flow view — the registry entry for the full-fidelity records-as-graph canvas.
   Config keys (all optional; every one carries a working default):
   EDGES        · relationField (the relation drawing edges; defaults to the first
                  relation) · secondaryRelationField (a 2nd self-relation drawn as a
                  distinct dashed edge type) · edgeStyle (smoothstep·bezier·straight·
                  step) · edgeLabels (bool) · animated (bool — animated edges)
   NODES        · labelField (card title; defaults to primary) · nodeColorField (a
                  select field tinting nodes; defaults to the stage/first select) ·
                  nodeShapeField (a select field giving nodes per-value shapes) ·
                  detailFields (array of field keys shown in the click-a-node panel;
                  defaults to every active field)
   LAYOUT       · enabledLayouts (which of hierarchical·force·grid the switcher
                  offers) · defaultLayout · groupField (a select field grouping nodes
                  into collapsible subflows) · collapsibleGroups (bool)
   INTERACTION  · handEdit (inline rename + resize + hand-create) · edgeDraw
                  (drag-between-records-to-relate) · nodeDetail (click → detail panel)
   State keys in the bag: flowRel (relation pick) · flowLayout (layout pick) ·
   flowGrouped (grouping on/off) · flowCollapsed (per-group collapse) · flowPos
   (dragged positions) · flowSizes (resized dimensions) — all per relation where it
   matters. The canvas (xyflow + dagre) is a React.lazy chunk; this eager file
   imports only the pure helpers. */

/* relation picker — RIGHT of the switcher (side "trail"), the GroupByMenu sibling:
   hidden unless the object offers a real choice */
function FlowToolbar({ object, viewConfig, viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "trail") return null;
  const rels = relationFields(object);
  if (rels.length <= 1) return null;
  const active = resolveRelation(object, viewConfig, viewState);
  const activeDef = rels.find((f) => f.key === active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" data-testid="flow-relation-menu">
          via {activeDef?.label ?? active}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {rels.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.key}
            checked={active === f.key}
            data-testid={`flow-relation-${f.key}`}
            onCheckedChange={() => onViewState({ flowRel: f.key })}
          >
            {f.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const definition: ViewDefinition = {
  type: "flow",
  label: "Flow",
  icon: <Network size={13} />,
  component: React.lazy(() => import("./FlowView")),
  Toolbar: FlowToolbar,
  configSchema: [
    { key: "relationField", label: "Relation (edges)", kind: "field", fieldTypes: ["relation"] },
    { key: "secondaryRelationField", label: "Secondary relation", kind: "field", fieldTypes: ["relation"] },
    { key: "labelField", label: "Card title field", kind: "field" },
    { key: "nodeColorField", label: "Color nodes by", kind: "field", fieldTypes: ["select"] },
    { key: "nodeShapeField", label: "Shape nodes by", kind: "field", fieldTypes: ["select"] },
    { key: "groupField", label: "Group into subflows by", kind: "field", fieldTypes: ["select"] },
    { key: "enabledLayouts", label: "Layouts offered", kind: "multiSelect", options: [...ALL_LAYOUTS] },
    { key: "defaultLayout", label: "Default layout", kind: "select", options: [...ALL_LAYOUTS] },
    { key: "edgeStyle", label: "Edge style", kind: "select", options: [...ALL_EDGE_STYLES] },
    { key: "edgeLabels", label: "Edge labels", kind: "boolean" },
    { key: "animated", label: "Animate edges", kind: "boolean" },
    { key: "handEdit", label: "Inline edit + resize + create", kind: "boolean" },
    { key: "edgeDraw", label: "Draw edges to relate", kind: "boolean" },
    { key: "nodeDetail", label: "Node detail panel", kind: "boolean" },
    { key: "collapsibleGroups", label: "Collapsible groups", kind: "boolean" },
  ],
  defaultConfig: (object) => ({ relationField: relationFields(object)[0]?.key }),
  validateConfig: (object, cfg) => {
    if (relationFields(object).length === 0)
      return `“${object.label}” has no relation field — a flow view draws records connected by one; add a relation field or remove this view`;
    const r = cfg.relationField;
    if (typeof r === "string" && r && !relationFields(object).some((f) => f.key === r))
      return `relationField “${r}” is not a relation field of ${object.key}`;
    const l = cfg.labelField;
    if (typeof l === "string" && l && !object.fields.some((f) => f.key === l && f.isActive !== false))
      return `labelField “${l}” is not a field of ${object.key}`;
    const selectKeys = new Set(selectFields(object).map((f) => f.key));
    for (const k of ["nodeColorField", "nodeShapeField", "groupField"] as const) {
      const v = cfg[k];
      if (typeof v === "string" && v && !selectKeys.has(v))
        return `${k} “${v}” is not a select field of ${object.key}`;
    }
    const s = cfg.secondaryRelationField;
    if (typeof s === "string" && s) {
      const f = object.fields.find((ff) => ff.key === s);
      if (!f || f.type !== "relation") return `secondaryRelationField “${s}” is not a relation field of ${object.key}`;
      if (f.relation !== object.key) return `secondaryRelationField “${s}” must be a self-relation (→ ${object.key}) to overlay a second edge type`;
    }
    return null;
  },
};

export default definition;
