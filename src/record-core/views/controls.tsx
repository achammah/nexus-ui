import * as React from "react";
import { ArrowDownUp, Rows3 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../primitives/Button";
import type { ViewToolbarProps } from "./types";
import { groupableFields, resolveGroupBy, resolveOptionalGroupBy, sortableFields } from "./group";
import { resolveSort } from "./sort";

/* Shared view-bar controls. The group-by picker is rendered by the board and
   chart (always grouped) AND the gallery (optional grouping via allowNone);
   they read/write the same viewState.groupBy, so regrouping one carries to the
   others. The sort picker writes the shared viewState.sortField/sortDir. */

export function GroupByMenu({
  object,
  viewConfig,
  viewState,
  onViewState,
  allowNone,
}: Pick<ViewToolbarProps, "object" | "viewConfig" | "viewState" | "onViewState"> & { allowNone?: boolean }) {
  const groupables = groupableFields(object);
  if (groupables.length <= 1 && !allowNone) return null;
  if (groupables.length === 0) return null;
  const active = allowNone
    ? resolveOptionalGroupBy(object, viewConfig, viewState)
    : resolveGroupBy(object, viewConfig, viewState);
  const activeDef = object.fields.find((f) => f.key === active);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" icon={<Rows3 size={13} />} data-testid="group-by">
          {active ? `by ${activeDef?.label ?? active}` : "Group"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allowNone && (
          <DropdownMenuCheckboxItem
            checked={!active}
            data-testid="group-by-none"
            onCheckedChange={() => onViewState({ groupBy: "" })}
          >
            None
          </DropdownMenuCheckboxItem>
        )}
        {groupables.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.key}
            checked={active === f.key}
            data-testid={`group-by-${f.key}`}
            onCheckedChange={() => onViewState({ groupBy: f.key })}
          >
            {f.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* Sort picker — field + direction. Writes the shared viewState.sortField /
   sortDir so any adopting view keeps the same order across a switch. */
export function SortMenu({ object, viewConfig, viewState, onViewState }: Pick<ViewToolbarProps, "object" | "viewConfig" | "viewState" | "onViewState">) {
  const fields = sortableFields(object);
  if (fields.length === 0) return null;
  const { key: sortField, dir } = resolveSort(object, viewConfig, viewState);
  const active = fields.find((f) => f.key === sortField);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" icon={<ArrowDownUp size={13} />} data-testid="sort-by">
          {active ? `${active.label} ${dir === "asc" ? "↑" : "↓"}` : "Sort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuCheckboxItem
          checked={!sortField}
          data-testid="sort-none"
          onCheckedChange={() => onViewState({ sortField: "" })}
        >
          None
        </DropdownMenuCheckboxItem>
        {fields.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.key}
            checked={sortField === f.key}
            data-testid={`sort-${f.key}`}
            onCheckedChange={() => onViewState({ sortField: f.key })}
          >
            {f.label}
          </DropdownMenuCheckboxItem>
        ))}
        {sortField && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={dir === "asc"} data-testid="sort-asc" onCheckedChange={() => onViewState({ sortDir: "asc" })}>
              Ascending
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={dir === "desc"} data-testid="sort-desc" onCheckedChange={() => onViewState({ sortDir: "desc" })}>
              Descending
            </DropdownMenuCheckboxItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
