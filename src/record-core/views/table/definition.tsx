import * as React from "react";
import { Columns3, Table2 } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import { DataTable } from "../../DataTable";
import type { ViewDefinition, ViewProps, ViewToolbarProps } from "../types";

/* Table view — the registry wrapper around DataTable. State keys in the bag:
   `hidden` (string[] of hidden field keys) · `sort` (SortingState). */

/* `ObjectConfig.columns` is the object's DEFAULT column visibility: the non-primary
   keys shown before the user touches the Columns menu. It applies only while the
   bag carries no `hidden` yet — once the user chooses, their choice is the truth
   (including an explicitly EMPTY array, which is why this tests for undefined
   rather than falsiness). Objects declaring no `columns` keep showing everything. */
export const defaultHidden = (object: ViewProps["object"], hidden: unknown): string[] => {
  if (Array.isArray(hidden)) return hidden as string[];
  if (!object.columns?.length) return [];
  const shown = new Set(object.columns);
  return object.fields.filter((f) => !f.primary && !shown.has(f.key)).map((f) => f.key);
};

function TableView({ object, rows, readOnly, viewState, onViewState, onOpen, onPeek, onPatch, selection, onSelectionChange }: ViewProps) {
  return (
    <DataTable
      config={object}
      rows={rows}
      onOpen={onOpen}
      onPeek={onPeek}
      onPatch={onPatch}
      readOnly={readOnly}
      hiddenFields={defaultHidden(object, viewState.hidden)}
      sort={(viewState.sort as SortingState) ?? []}
      onSortChange={(s) => onViewState({ sort: s })}
      selection={selection}
      onSelectionChange={onSelectionChange}
    />
  );
}

/* the Columns visibility menu — sits LEFT of the view switcher (side "lead") */
function TableToolbar({ object, viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "lead") return null;
  const hidden = defaultHidden(object, viewState.hidden);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="md" variant="ghost" icon={<Columns3 size={14} />} data-testid="columns-menu">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {object.fields
          .filter((f) => !f.primary)
          .map((f) => (
            <DropdownMenuCheckboxItem
              key={f.key}
              checked={!hidden.includes(f.key)}
              data-testid={`col-toggle-${f.key}`}
              onCheckedChange={(on) =>
                onViewState({ hidden: on ? hidden.filter((k) => k !== f.key) : [...hidden, f.key] })
              }
              onSelect={(e) => e.preventDefault()}
            >
              {f.label}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const definition: ViewDefinition = {
  type: "table",
  label: "Table",
  icon: <Table2 size={13} />,
  component: TableView,
  Toolbar: TableToolbar,
};

export default definition;
