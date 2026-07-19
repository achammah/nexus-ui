import * as React from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Checkbox } from "../primitives/fields";
import type { FieldDef, ObjectConfig, RecordRow } from "./types";
import { optionValues } from "./types";
import { OptionChip, activeFields } from "./options";
import "./record-core.css";

/* DataTable — the record-core grid. Config-driven columns, sortable, selectable,
   inline-editable text/select cells (edit commits on blur/Enter via onPatch). */

const num = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatCell = (v: unknown, type: string) => {
  if ((type === "number" || type === "currency") && typeof v === "number") return num.format(v);
  if (type === "date" && v) {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : dateFmt.format(d);
  }
  if (type === "dateTime" && v) {
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : dateTimeFmt.format(d);
  }
  if (type === "boolean") return v === true ? "Yes" : v === false ? "No" : "—";
  if (type === "rating") return typeof v === "number" ? "★".repeat(v) + "☆".repeat(Math.max(0, 5 - v)) : "—";
  if (type === "array" || type === "multiselect") return Array.isArray(v) ? v.join(" · ") : String(v ?? "");
  if (type === "json") return v == null ? "—" : JSON.stringify(v).slice(0, 60);
  if (type === "longText") { const s = String(v ?? ""); return s.length > 80 ? s.slice(0, 77) + "…" : s; }
  return String(v ?? "");
};

/* read-only typed table cells (editing lives on the record page) */
function UserCell({ value }: { value: unknown }) {
  const name = String(value ?? "");
  if (!name) return <span>—</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 18, height: 18, borderRadius: "50%", flex: "none",
          background: "var(--nx-accent-soft)", color: "var(--nx-accent)",
          display: "grid", placeItems: "center", font: "700 9px/1 var(--nx-font-sans)",
        }}
      >
        {name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </span>
      {name}
    </span>
  );
}

function TagsCell({ value, field }: { value: unknown; field?: FieldDef }) {
  const tags = Array.isArray(value) ? value.map(String) : [];
  if (!tags.length) return <span>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {tags.slice(0, 2).map((t) => (
        <OptionChip key={t} field={field} value={t} />
      ))}
      {tags.length > 2 && <span className="nxCount">+{tags.length - 2}</span>}
    </span>
  );
}

function RatingCell({ row, field, onPatch, readOnly }: { row: RecordRow; field: FieldDef; onPatch: (id: string, p: Record<string, unknown>) => void; readOnly?: boolean }) {
  const scale = field.scale ?? 5;
  const val = typeof row[field.key] === "number" ? (row[field.key] as number) : 0;
  return (
    <span data-testid={`cell-${row.id}-${field.key}`} style={{ letterSpacing: 2, cursor: readOnly ? "default" : "pointer", color: "var(--nx-warn)" }}>
      {Array.from({ length: scale }, (_, i) => (
        <span
          key={i}
          data-testid={`rate-${row.id}-${field.key}-${i + 1}`}
          onClick={() => !readOnly && onPatch(row.id, { [field.key]: i + 1 === val ? 0 : i + 1 })}
        >
          {i < val ? "★" : "☆"}
        </span>
      ))}
    </span>
  );
}

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
  readOnly,
}: {
  row: RecordRow;
  field: FieldDef;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const initial = String(row[field.key] ?? "");
  const [v, setV] = React.useState(initial);
  React.useEffect(() => setV(String(row[field.key] ?? "")), [row, field.key]);
  const [editing, setEditing] = React.useState(false);
  if (readOnly) {
    return <span data-testid={`cell-${row.id}-${field.key}`}>{formatCell(row[field.key], field.type) || "—"}</span>;
  }
  const commit = () => {
    if (v !== initial) onPatch(row.id, { [field.key]: field.type === "number" || field.type === "currency" ? Number(v) : v });
  };
  if (field.type === "select") {
    const colored = (field.options ?? []).some((o) => typeof o !== "string" && o.color);
    const picker = (
      <select
        className="nxCellEdit"
        style={colored ? { position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" } : undefined}
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          onPatch(row.id, { [field.key]: e.target.value });
        }}
        aria-label={field.label}
      >
        {optionValues(field.options).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
    if (!colored) return picker;
    // colored options render as the chip; the invisible native select on top keeps
    // one-click editing (chip look, dropdown behavior)
    return (
      <span style={{ position: "relative", display: "inline-flex" }}>
        <OptionChip field={field} value={v} testid={`cell-${row.id}-${field.key}`} />
        {picker}
      </span>
    );
  }
  // dates read formatted in tables; editing happens on the record page (calendar)
  if (field.type === "date") {
    return <span data-testid={`cell-${row.id}-${field.key}`}>{formatCell(row[field.key], "date") || "—"}</span>;
  }
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
  sort,
  onSortChange,
  readOnly,
}: {
  config: ObjectConfig;
  rows: RecordRow[];
  onOpen: (id: string) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  hiddenFields?: string[];
  selection?: Record<string, boolean>;
  onSelectionChange?: (sel: Record<string, boolean>) => void;
  /* controlled sorting (optional) — consumers persist it in their saved view */
  sort?: SortingState;
  onSortChange?: (s: SortingState) => void;
  /* permission-driven: cells render as formatted text, no editors */
  readOnly?: boolean;
}) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const sorting = sort ?? internalSorting;
  const setSorting: React.Dispatch<React.SetStateAction<SortingState>> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    onSortChange ? onSortChange(next) : setInternalSorting(next);
  };
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
    for (const f of activeFields(config.fields)) {
      if (hiddenFields.includes(f.key)) continue;
      defs.push(
        col.accessor((r) => r[f.key], {
          id: f.key,
          size: f.width ?? 160,
          header: () => f.label,
          cell: ({ row }) =>
            f.type === "relation" ? (
              <RelationCell row={row.original} field={f} />
            ) : f.type === "user" ? (
              <UserCell value={row.original[f.key]} />
            ) : f.type === "multiselect" ? (
              <TagsCell value={row.original[f.key]} field={f} />
            ) : f.type === "boolean" ? (
              <Checkbox
                aria-label={f.label}
                checked={row.original[f.key] === true}
                data-testid={`cell-${row.original.id}-${f.key}`}
                onCheckedChange={readOnly ? () => {} : (v) => onPatch(row.original.id, { [f.key]: v })}
              />
            ) : f.type === "rating" ? (
              <RatingCell row={row.original} field={f} onPatch={onPatch} readOnly={readOnly} />
            ) : ["dateTime", "json", "longText", "array"].includes(f.type) ? (
              <span data-testid={`cell-${row.original.id}-${f.key}`}>{formatCell(row.original[f.key], f.type) || "—"}</span>
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
              <CellEditor row={row.original} field={f} onPatch={onPatch} readOnly={readOnly} />
            ),
        }),
      );
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, hiddenFields, selection, onSelectionChange, onPatch, readOnly]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Big lists virtualize (rows beyond VIRTUAL_AT render on scroll, not in the DOM) —
  // the wrap becomes the scroll container; spacer rows keep the table layout honest.
  const VIRTUAL_AT = 80;
  const modelRows = table.getRowModel().rows;
  const virtual = modelRows.length > VIRTUAL_AT;
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: modelRows.length,
    getScrollElement: () => wrapRef.current,
    estimateSize: () => 37,
    overscan: 12,
    enabled: virtual,
  });
  const vItems = virtual ? virtualizer.getVirtualItems() : null;
  const padTop = vItems && vItems.length ? vItems[0].start : 0;
  const padBottom = vItems && vItems.length ? virtualizer.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const visibleRows = vItems ? vItems.map((vi) => modelRows[vi.index]) : modelRows;

  return (
    <div
      className="nxTableWrap"
      data-testid={`table-${config.key}`}
      ref={wrapRef}
      style={virtual ? { maxHeight: "70vh" } : undefined}
    >
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
          {padTop > 0 && (
            <tr aria-hidden>
              <td style={{ height: padTop, padding: 0, border: 0 }} colSpan={columns.length} />
            </tr>
          )}
          {visibleRows.map((r) => (
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
          {padBottom > 0 && (
            <tr aria-hidden>
              <td style={{ height: padBottom, padding: 0, border: 0 }} colSpan={columns.length} />
            </tr>
          )}
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
