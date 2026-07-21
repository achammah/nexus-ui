import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Button } from "../../primitives/Button";
import type { ViewToolbarProps } from "./types";
import { groupableFields, resolveGroupBy } from "./group";

/* Shared view-bar controls. The group-by picker is rendered by BOTH the board
   and the chart (they read/write the same viewState.groupBy — regroup one and
   the other follows), so it lives here once. */

export function GroupByMenu({ object, viewConfig, viewState, onViewState }: Pick<ViewToolbarProps, "object" | "viewConfig" | "viewState" | "onViewState">) {
  const groupables = groupableFields(object);
  if (groupables.length <= 1) return null;
  const groupBy = resolveGroupBy(object, viewConfig, viewState);
  const groupFieldDef = object.fields.find((f) => f.key === groupBy);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" data-testid="group-by">
          by {groupFieldDef?.label ?? groupBy}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {groupables.map((f) => (
          <DropdownMenuCheckboxItem
            key={f.key}
            checked={groupBy === f.key}
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
