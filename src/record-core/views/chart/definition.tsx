import * as React from "react";
import { BarChart3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import { ChartView } from "../../ChartView";
import type { ViewDefinition, ViewProps, ViewToolbarProps } from "../types";
import { groupableFields, measurableFields, resolveGroupBy } from "../group";
import { GroupByMenu } from "../controls";

/* Chart view — the registry wrapper around ChartView. Config keys:
   `groupField` (select/user field key) · `measure` ("count" or a numeric field
   key to SUM per group). State keys in the bag: `groupBy` (shared with the
   board) · `measure`. */

const resolveMeasure = (viewConfig: Record<string, unknown>, viewState: Record<string, unknown>): string =>
  (typeof viewState.measure === "string" ? viewState.measure : undefined) ??
  (typeof viewConfig.measure === "string" ? viewConfig.measure : undefined) ??
  "count";

function ChartViewWrapper({ object, rows, users, viewConfig, viewState }: ViewProps) {
  const groupBy = resolveGroupBy(object, viewConfig, viewState);
  const groupFieldDef = object.fields.find((f) => f.key === groupBy);
  const measure = resolveMeasure(viewConfig, viewState);
  const measureDef = measurableFields(object).find((f) => f.key === measure);
  return (
    <ChartView
      config={object}
      rows={rows}
      groupField={groupBy}
      groupOptions={groupFieldDef?.type === "user" ? users : undefined}
      measure={measureDef ? measure : "count"}
    />
  );
}

/* measure + group-by pickers — RIGHT of the switcher (side "trail") */
function ChartToolbar({ object, users, viewConfig, viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "trail") return null;
  const numericFields = measurableFields(object);
  const measure = resolveMeasure(viewConfig, viewState);
  const measureDef = numericFields.find((f) => f.key === measure);
  return (
    <>
      {numericFields.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" data-testid="measure-by">
              {measureDef ? `Σ ${measureDef.label}` : "Count"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem
              checked={!measureDef}
              data-testid="measure-count"
              onCheckedChange={() => onViewState({ measure: "count" })}
            >
              Count
            </DropdownMenuCheckboxItem>
            {numericFields.map((f) => (
              <DropdownMenuCheckboxItem
                key={f.key}
                checked={measure === f.key}
                data-testid={`measure-${f.key}`}
                onCheckedChange={() => onViewState({ measure: f.key })}
              >
                Σ {f.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <GroupByMenu object={object} viewConfig={viewConfig} viewState={viewState} onViewState={onViewState} />
    </>
  );
}

const definition: ViewDefinition = {
  type: "chart",
  label: "Chart",
  icon: <BarChart3 size={13} />,
  component: ChartViewWrapper,
  Toolbar: ChartToolbar,
  configSchema: [
    { key: "groupField", label: "Group by", kind: "field", fieldTypes: ["select", "user"] },
    { key: "measure", label: "Measure", kind: "field", fieldTypes: ["number", "currency", "money"] },
  ],
  defaultConfig: (object) => ({ groupField: object.stageField ?? groupableFields(object)[0]?.key, measure: "count" }),
  validateConfig: (object, cfg) => {
    if (groupableFields(object).length === 0) return `“${object.label}” has no select or user field to group by`;
    const g = cfg.groupField;
    if (typeof g === "string" && g && !groupableFields(object).some((f) => f.key === g))
      return `groupField “${g}” is not a select or user field of ${object.key}`;
    return null;
  },
};

export default definition;
