import * as React from "react";
import { Kanban, Sigma } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import { KanbanBoard } from "../../KanbanBoard";
import type { ViewDefinition, ViewProps, ViewToolbarProps } from "../types";
import { groupableFields, measurableFields, resolveGroupBy } from "../group";
import { GroupByMenu } from "../controls";

/* Board view — the registry wrapper around KanbanBoard. Config keys:
   `groupField` (a select/user field key; defaults to the object's stageField) ·
   `cardFields` (field keys shown on the card meta line, in order; default: the
   first two non-primary, non-grouped fields).
   State keys in the bag: `groupBy` (shared with the chart) · `aggregate`
   ({fn, field} per-column rollup). */

type Agg = { fn: "sum" | "avg" | "min" | "max"; field: string };

function KanbanView({ object, rows, users, readOnly, viewConfig, viewState, onOpen, onPatch }: ViewProps) {
  const groupBy = resolveGroupBy(object, viewConfig, viewState);
  const groupFieldDef = object.fields.find((f) => f.key === groupBy);
  return (
    <KanbanBoard
      config={object}
      rows={rows}
      onPatch={onPatch}
      onOpen={onOpen}
      groupField={groupBy}
      groupOptions={groupFieldDef?.type === "user" ? users : undefined}
      readOnly={readOnly}
      aggregate={(viewState.aggregate as Agg | null) ?? undefined}
      cardFields={Array.isArray(viewConfig.cardFields) ? (viewConfig.cardFields as string[]) : undefined}
    />
  );
}

/* group-by + per-column rollup pickers — RIGHT of the switcher (side "trail") */
function KanbanToolbar({ object, users, viewConfig, viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "trail") return null;
  const numericFields = measurableFields(object);
  const aggregate = (viewState.aggregate as Agg | null) ?? null;
  return (
    <>
      <GroupByMenu object={object} viewConfig={viewConfig} viewState={viewState} onViewState={onViewState} />
      {numericFields.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" icon={<Sigma size={13} />} data-testid="agg-by">
              {aggregate ? `${aggregate.fn} · ${object.fields.find((f) => f.key === aggregate.field)?.label ?? aggregate.field}` : "Rollup"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem checked={!aggregate} data-testid="agg-none" onCheckedChange={() => onViewState({ aggregate: null })}>
              None
            </DropdownMenuCheckboxItem>
            {numericFields.flatMap((f) =>
              (["sum", "avg", "min", "max"] as const).map((fn) => (
                <DropdownMenuCheckboxItem
                  key={`${fn}-${f.key}`}
                  checked={aggregate?.fn === fn && aggregate.field === f.key}
                  data-testid={`agg-${fn}-${f.key}`}
                  onCheckedChange={() => onViewState({ aggregate: { fn, field: f.key } })}
                >
                  {fn === "sum" ? "Sum" : fn === "avg" ? "Average" : fn === "min" ? "Min" : "Max"} of {f.label}
                </DropdownMenuCheckboxItem>
              )),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

const definition: ViewDefinition = {
  type: "kanban",
  label: "Board",
  icon: <Kanban size={13} />,
  component: KanbanView,
  Toolbar: KanbanToolbar,
  configSchema: [
    { key: "groupField", label: "Group by", kind: "field", fieldTypes: ["select", "user"] },
  ],
  defaultConfig: (object) => ({ groupField: object.stageField ?? groupableFields(object)[0]?.key }),
  validateConfig: (object, cfg) => {
    if (groupableFields(object).length === 0) return `“${object.label}” has no select or user field to group by`;
    const g = cfg.groupField;
    if (typeof g === "string" && g && !groupableFields(object).some((f) => f.key === g))
      return `groupField “${g}” is not a select or user field of ${object.key}`;
    return null;
  },
};

export default definition;
