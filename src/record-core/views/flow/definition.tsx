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

/* Flow view — the registry entry for the records-as-graph canvas. Config keys:
   `relationField` (the relation drawing the edges; defaults to the object's
   first relation field) · `labelField` (the card title; defaults to primary).
   State keys in the bag: `flowRel` (the toolbar's runtime relation pick) ·
   `flowPos` (per-relation map of dragged node positions). The canvas itself
   (xyflow + dagre) is a React.lazy chunk — this file stays in the eager bundle,
   so it imports only the pure graph helpers. */

/* relation picker — RIGHT of the switcher (side "trail"), the GroupByMenu
   sibling: hidden unless the object offers a real choice */
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
    { key: "labelField", label: "Card title field", kind: "field" },
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
    return null;
  },
};

export default definition;
