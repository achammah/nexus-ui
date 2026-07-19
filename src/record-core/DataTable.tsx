import * as React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "../primitives/fields";
import type { FieldDef, ObjectConfig, RecordRow } from "./types";
import "./record-core.css";

/* DataTable — the record-core grid. Config-driven columns, sortable, selectable,
   inline-editable text/select cells (edit commits on blur/Enter via onPatch). */

const num = new Intl.NumberFormat("en-US");
export const formatCell = (v: unknown, type: string) =>
  (type === "number" || type === "currency") && typeof v === "number" ? num.format(v) : String(v ?? "");

function RelationCell({ row, field }: { row: RecordRow; field: FieldDef }) {
  const value = String(row[field.key] ?? "");
  if (!value) return <span>—</span>;
  return (
    <a
      className="nxRowLink"
      style={{ color: "var(--nx-accent)" }}
      href={`#/o/${field.relation}`}
      data-testid={`rel-${row.id}-${field.key}`}
      onClick={() => {
        // hand the target name to the destination list as a pending filter
        sessionStorage.setItem("nx-pending-q", value);
      }}
    >
      {value}
    </a>
  );
}

function CellEditor({
  row,
  field,
  onPatch,
}: {
  row: RecordRow;
  field: FieldDef;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
}) {
  const initial = String(row[field.key] ?? "");
  const [v, setV] = React.useState(initial);
  React.useEffect(() => setV(String(row[field.key] ?? "")), [row, field.key]);
  const commit = () => {
    if (v !== initial) onPatch(row.id, { [field.key]: field.type === "number" || field.type === "currency" ? Number(v) : v });
  };
  if (field.type === "select") {
    return (
      <select
        className="nxCellEdit"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onPatch(row.id, { [field.key]: e.target.value });
        }}
        aria-label={field.label}
      >
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }
  const [editing, setEditing] = React.useState(false);
  if (!editing && (field.type === "number" || field.type === "currency")) {
    return (
      <span
        className="nxCellEdit"
        style={{ display: "block", cursor: "text" }}
        tabIndex={0}
        aria-label={field.label}
        onFocus={() => setEditing(true)}
        onClick={() => setEditing(true)}
      >
        {formatCell(row[field.key], field.type)}
      </span>
    );
  }
  return (
    <input
      className="nxCellEdit"
      value={v}
      autoFocus={editing}
      aria-label={field.label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        commit();
        setEditing(false);
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function DataTable({
  config,
  rows,
  onOpen,
  onPatch,
  hiddenFields = [],
  selection,
  onSelectionChange,
}: {
  config: ObjectConfig;
  rows: RecordRow[];
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  hiddenFields?: string[];
  selection?: Record<string, boolean>;
  onSelectionChange?: (sel: Record<string, boolean>) => void;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const col = createColumnHelper<RecordRow>();
  const primary = config.fields.find((f) => f.primary) ?? config.fields[0];

  const columns = React.useMemo(() => {
    const defs = [];
    if (onSelectionChange) {
      defs.push(
        col.display({
          id: "_sel",
          size: 34,
          header: () => null,
          cell: ({ row }) => (
            <Checkbox
              aria-label="Select row"
              checked={!!selection?.[row.original.id]}
              onCheckedChange={(v) => onSelectionChange({ ...selection, [row.original.id]: v })}
            />
          ),
        }),
      );
    }
    for (const f of config.fields) {
      if (hiddenFields.includes(f.key)) continue;
      defs.push(
        col.accessor((r) => r[f.key], {
          id: f.key,
          size: f.width ?? 160,
          header: () => f.label,
          cell: ({ row }) =>
            f.type === "relation" ? (
              <RelationCell row={row.original} field={f} />
            ) : f.primary ? (
              <a
                className="nxRowLink"
                href={`#/o/${config.key}/r/${row.original.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onOpen(row.original.id);
                }}
                data-journey={`open-${config.key}`}
              >
                {String(row.original[f.key] ?? "—")}
              </a>
            ) : (
              <CellEditor row={row.original} field={f} onPatch={onPatch} />
            ),
        }),
      );
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, hiddenFields, selection, onSelectionChange, onPatch]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="nxTableWrap" data-testid={`table-${config.key}`}>
      <table className="nxTable">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const f = config.fields.find((x) => x.key === h.id);
                const numCls = f && (f.type === "number" || f.type === "currency") ? "nxNum" : "";
                return (
                  <th key={h.id} className={numCls} style={{ width: h.getSize() }} onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" && <ArrowUp className="nxSortMark" size={11} />}
                    {h.column.getIsSorted() === "desc" && <ArrowDown className="nxSortMark" size={11} />}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} data-testid={`row-${(r.original as RecordRow).id}`}>
              {r.getVisibleCells().map((c) => {
                const f = config.fields.find((x) => x.key === c.column.id);
                const numCls = f && (f.type === "number" || f.type === "currency") ? "nxNum" : "";
                return (
                  <td key={c.id} className={numCls}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div style={{ padding: 28, textAlign: "center", color: "var(--nx-fg-faint)" }}>
          No {config.label.toLowerCase()} yet.
        </div>
      )}
      <span style={{ display: "none" }} data-primary-field={primary.key} />
    </div>
  );
}
