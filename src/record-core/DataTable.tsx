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
import { fieldBlocksKbEdit, fieldClearValue, fieldPreviewText, getFieldTypeDefinition } from "./fields/registry";
import type { FieldDef, ObjectConfig, RecordRow } from "./types";
import { addressLine, formatMoney, hostLabel, isMoneyValue, joinName, optionValues, rowRefs } from "./types";
import { blocksToMarkdown, type Block } from "./NotionEditor";
import { OptionChip, activeFields } from "./options";
import "./record-core.css";

/* richText (Block[]) → readable plain text for a truncated table preview: flatten
   to markdown, then strip the markup so a cell reads as prose (never [object Object]
   or raw JSON). Editing happens on the record page. */
export const richTextPreview = (v: unknown): string => {
  if (!Array.isArray(v)) return "";
  return blocksToMarkdown(v as Block[])
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
};

/* DataTable — the record-core grid. Config-driven columns, sortable, selectable,
   inline-editable text/select cells (edit commits on blur/Enter via onPatch). */

const num = new Intl.NumberFormat("en-US");
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const formatCell = (v: unknown, type: string) => {
  // installed field types (fields/registry) own their one-line text everywhere
  const registered = fieldPreviewText(type, v);
  if (registered !== undefined) return registered;
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
  if (type === "richText") { const s = richTextPreview(v); return s.length > 80 ? s.slice(0, 77) + "…" : s; }
  if (type === "money" && isMoneyValue(v)) return formatMoney(v);
  if ((type === "emails" || type === "phones") && Array.isArray(v)) return v.join(" · ");
  if (type === "links" && Array.isArray(v)) return v.map((u) => hostLabel(String(u))).join(" · ");
  if (type === "address") return addressLine(v);
  if (type === "fullName") return joinName(v);
  return String(v ?? "");
};

/* CSV-safe flat text for a cell value (consumers pipe it through their own
   quoting): money → "12500 EUR" · lists → "a; b" · address/fullName → joined.
   Non-shaped types keep their raw String() so existing exports don't shift. */
export const csvCell = (v: unknown, type: string): string => {
  if (v === null || v === undefined) return "";
  const registered = fieldPreviewText(type, v);
  if (registered !== undefined) return registered;
  if (type === "money" && isMoneyValue(v)) return `${v.amount} ${v.code ?? ""}`.trim();
  if ((type === "emails" || type === "phones" || type === "links") && Array.isArray(v)) return v.join("; ");
  if (type === "relation" && Array.isArray(v)) return v.join("; "); // many-relation labels
  if (type === "address") return addressLine(v, true);
  if (type === "fullName") return joinName(v);
  return String(v);
};

/* list cells (emails/phones): first entry + "+N" — the full list edits on the record page */
function ListChipsCell({ row, field }: { row: RecordRow; field: FieldDef }) {
  const vals = Array.isArray(row[field.key]) ? (row[field.key] as unknown[]).map(String) : [];
  if (!vals.length) return <span data-testid={`cell-${row.id}-${field.key}`}>—</span>;
  return (
    <span data-testid={`cell-${row.id}-${field.key}`} style={{ display: "inline-flex", gap: 4, alignItems: "center", minWidth: 0 }}>
      <span
        className="nxOptChip"
        style={{ background: "var(--nx-bg-sunken)", border: "1px solid var(--nx-border)", color: "var(--nx-fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {vals[0]}
      </span>
      {vals.length > 1 && <span className="nxCount">+{vals.length - 1}</span>}
    </span>
  );
}

function LinksCell({ row, field }: { row: RecordRow; field: FieldDef }) {
  const vals = Array.isArray(row[field.key]) ? (row[field.key] as unknown[]).map(String) : [];
  if (!vals.length) return <span data-testid={`cell-${row.id}-${field.key}`}>—</span>;
  const href = (u: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`);
  return (
    <span data-testid={`cell-${row.id}-${field.key}`} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {vals.slice(0, 2).map((u, i) => (
        <a
          key={`${u}-${i}`}
          className="nxRowLink"
          style={{ color: "var(--nx-accent)" }}
          href={href(u)}
          target="_blank"
          rel="noreferrer"
          data-testid={`cell-${row.id}-${field.key}-link-${i}`}
          onClick={(e) => e.stopPropagation()}
        >
          {hostLabel(u)}
        </a>
      ))}
      {vals.length > 2 && <span className="nxCount">+{vals.length - 2}</span>}
    </span>
  );
}

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
  // MANY-relation: projected labels render as chips (first two + overflow)
  if (field.multiple) {
    const labels = Array.isArray(row[field.key]) ? (row[field.key] as unknown[]).map(String) : [];
    if (!labels.length) return <span data-testid={`rel-${row.id}-${field.key}`}>—</span>;
    return (
      <span data-testid={`rel-${row.id}-${field.key}`} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        {labels.slice(0, 2).map((t, i) => (
          <span key={`${t}-${i}`} className="nxOptChip" style={{ background: "var(--nx-bg-sunken)", border: "1px solid var(--nx-border)", color: "var(--nx-fg-muted)" }}>
            {t}
          </span>
        ))}
        {labels.length > 2 && <span className="nxCount">+{labels.length - 2}</span>}
      </span>
    );
  }
  const value = String(row[field.key] ?? "");
  if (!value) return <span>—</span>;
  // POLY: the link's destination comes from the row's ref (field has no single target)
  const ref = rowRefs(row)[field.key];
  const targetObj = field.relation ?? (typeof ref === "object" && !Array.isArray(ref) ? ref.object : undefined);
  if (!targetObj) return <span data-testid={`rel-${row.id}-${field.key}`}>{value}</span>;
  return (
    <a
      className="nxRowLink"
      style={{ color: "var(--nx-accent)" }}
      href={`#/o/${targetObj}`}
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
  kbSeed,
  kbEdit,
  onEditState,
  onAdvance,
}: {
  row: RecordRow;
  field: FieldDef;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
  /* keyboard grid: begin editing seeded with the typed character */
  kbSeed?: string | null;
  kbEdit?: boolean;
  onEditState?: (editing: boolean) => void;
  onAdvance?: (dir: "down" | "right" | "left" | "stay") => void;
}) {
  const initial = String(row[field.key] ?? "");
  const [v, setV] = React.useState(initial);
  React.useEffect(() => setV(String(row[field.key] ?? "")), [row, field.key]);
  const [editing, setEditingRaw] = React.useState(false);
  const cancelRef = React.useRef(false);
  const setEditing = (on: boolean, seed?: string) => {
    setEditingRaw(on);
    if (on) setV(seed !== undefined ? seed : String(row[field.key] ?? ""));
    onEditState?.(on);
  };
  // the grid model can force this cell into edit mode (Enter / type-to-edit)
  React.useEffect(() => {
    if (kbEdit && !editing) setEditing(true, kbSeed ?? undefined);
    if (!kbEdit && editing) setEditingRaw(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbEdit, kbSeed]);
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
  // closed state: formatted text, one click (or Enter / type-to-edit) opens the editor
  if (!editing) {
    return (
      <span
        className="nxCellEdit"
        style={{ display: "block", cursor: "text", minHeight: 18 }}
        data-testid={`cell-${row.id}-${field.key}`}
        aria-label={field.label}
        onClick={() => setEditing(true)}
      >
        {formatCell(row[field.key], field.type) || "\u00a0"}
      </span>
    );
  }
  return (
    <input
      className="nxCellEdit"
      value={v}
      autoFocus
      aria-label={field.label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        // an Escape-cancel moves focus (blur fires before the reverted value
        // re-renders) — without this guard the CANCELLED text would commit
        if (cancelRef.current) { cancelRef.current = false; setEditing(false); return; }
        commit();
        setEditing(false);
      }}
      onKeyDown={(e) => {
        // spreadsheet advance: Enter saves + moves down; Tab lateral; Escape cancels
        if (e.key === "Enter") {
          commit();
          setEditing(false);
          onAdvance?.("down");
          e.preventDefault();
        } else if (e.key === "Tab") {
          commit();
          setEditing(false);
          onAdvance?.(e.shiftKey ? "left" : "right");
          e.preventDefault();
        } else if (e.key === "Escape") {
          cancelRef.current = true;
          setV(initial);
          setEditing(false);
          onAdvance?.("stay");
          e.stopPropagation();
        }
      }}
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
  onPeek,
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
  /* Cmd/Ctrl+Enter on a focused row — open without leaving the list */
  onPeek?: (id: string) => void;
}) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const sorting = sort ?? internalSorting;
  const setSorting: React.Dispatch<React.SetStateAction<SortingState>> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    onSortChange ? onSortChange(next) : setInternalSorting(next);
  };
  /* ---- keyboard grid: three focus levels (row → cell → editing) ----
     Row focus: ↑↓ or j/k move · x selects (Shift+x extends) · Cmd/Ctrl+A selects all
     · Enter drops into the first cell · Cmd/Ctrl+Enter peeks · Escape clears.
     Cell focus: arrows move · Enter (or typing, which SEEDS the editor) edits ·
     Backspace clears the value · Escape returns to row focus.
     Editing: Enter saves + moves down · Tab/Shift+Tab save + move laterally ·
     Escape closes. Focus follows the SORTED order. */
  const [focus, setFocus] = React.useState<{ row: number; col: string | null } | null>(null);
  const [kbEdit, setKbEdit] = React.useState<{ rowId: string; col: string; seed: string | null } | null>(null);
  const selAnchor = React.useRef<number | null>(null);
  const gridCols = activeFields(config.fields).filter((f) => !hiddenFields.includes(f.key)).map((f) => f.key);
  const fieldOf = (key: string | null) => config.fields.find((x) => x.key === key);
  // keyboard-editable = whatever falls to the generic inline input below
  // (text, url, email, number, currency, custom types…) — the same rule the
  // cell renderer uses, so the two can't drift
  const SPECIAL = [
    "relation", "user", "multiselect", "boolean", "rating", "dateTime", "json", "longText", "array", "select", "date",
    "money", "emails", "phones", "links", "address", "fullName", "richText",
  ];
  // registry types may declare keyboardEditable:false (a canvas is never type-to-edited)
  const canKbEdit = (type: string) => !SPECIAL.includes(type) && !fieldBlocksKbEdit(type);
  const CLEARABLE: Record<string, unknown> = {
    number: null, currency: null, boolean: false,
    multiselect: [], array: [], user: "", rating: 0,
    emails: [], phones: [], links: [],
    money: null, address: null, fullName: null,
  };
  // field-aware: a MANY relation clears to [], any other relation to null;
  // registry types clear to their declared clearValue (undefined = not clearable)
  const clearValue = (f: FieldDef) => {
    const registered = getFieldTypeDefinition(f.type);
    if (registered) return fieldClearValue(f.type);
    return f.type === "relation" ? (f.multiple ? [] : null) : f.type in CLEARABLE ? CLEARABLE[f.type] : canKbEdit(f.type) ? "" : undefined;
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
            // registry cells first: an installed field type's read-only list cell
            // (e.g. a whiteboard thumbnail); the host supplies the testid wrapper
            (() => {
              const Cell = getFieldTypeDefinition(f.type)?.cell;
              return Cell ? (
                <span data-testid={`cell-${row.original.id}-${f.key}`}>
                  <Cell field={f} row={row.original} value={row.original[f.key]} />
                </span>
              ) : null;
            })() ??
            (f.type === "relation" ? (
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
            ) : ["dateTime", "json", "longText", "array", "richText"].includes(f.type) ? (
              <span data-testid={`cell-${row.original.id}-${f.key}`}>{formatCell(row.original[f.key], f.type) || "—"}</span>
            ) : f.type === "emails" || f.type === "phones" ? (
              <ListChipsCell row={row.original} field={f} />
            ) : f.type === "links" ? (
              <LinksCell row={row.original} field={f} />
            ) : ["money", "address", "fullName"].includes(f.type) && !f.primary ? (
              <span data-testid={`cell-${row.original.id}-${f.key}`}>{formatCell(row.original[f.key], f.type) || "—"}</span>
            ) : f.primary ? (
              <a
                className="nxRowLink"
                href={`#/o/${config.key}/r/${row.original.id}`}
                onClick={(e) => {
                  // real link: cmd/ctrl-click opens a genuine new tab (full page)
                  if (e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  onOpen(row.original.id);
                }}
                data-journey={`open-${config.key}`}
              >
                {formatCell(row.original[f.key], f.type) || "—"}
              </a>
            ) : (
              <CellEditor
                row={row.original}
                field={f}
                onPatch={onPatch}
                readOnly={readOnly}
                kbEdit={kbEdit?.rowId === row.original.id && kbEdit.col === f.key}
                kbSeed={kbEdit?.rowId === row.original.id && kbEdit.col === f.key ? kbEdit.seed : null}
                onEditState={(on) => { if (!on) setKbEdit((k) => (k?.rowId === row.original.id && k.col === f.key ? null : k)); }}
                onAdvance={(dir) => {
                  const idx = modelRowsRef.current.findIndex((mr) => (mr.original as RecordRow).id === row.original.id);
                  advance({ row: idx < 0 ? 0 : idx, col: f.key }, dir);
                }}
              />
            )),
        }),
      );
    }
    return defs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, hiddenFields, selection, onSelectionChange, onPatch, readOnly, kbEdit]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    // shift-click a second header for tie-breaker (multi-level) sorting
    enableMultiSort: true,
    isMultiSortEvent: (e) => (e as MouseEvent).shiftKey,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Big lists virtualize (rows beyond VIRTUAL_AT render on scroll, not in the DOM) —
  // the wrap becomes the scroll container; spacer rows keep the table layout honest.
  const VIRTUAL_AT = 80;
  const modelRows = table.getRowModel().rows;
  const modelRowsRef = React.useRef(modelRows);
  modelRowsRef.current = modelRows;
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

  // keep the keyboard-focused row rendered + in view (virtualized lists included)
  React.useEffect(() => {
    if (!focus) return;
    if (virtual) virtualizer.scrollToIndex(focus.row);
    else wrapRef.current?.querySelector("tr[data-row-focus]")?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.row]);

  const advance = (from: { row: number; col: string }, dir: "down" | "right" | "left" | "stay") => {
    setKbEdit(null);
    if (dir === "down") setFocus({ row: Math.min(from.row + 1, modelRowsRef.current.length - 1), col: from.col });
    else if (dir === "right" || dir === "left") {
      const i = gridCols.indexOf(from.col);
      const ni = dir === "right" ? Math.min(i + 1, gridCols.length - 1) : Math.max(i - 1, 0);
      setFocus({ row: from.row, col: gridCols[ni] });
    } else setFocus({ row: from.row, col: from.col });
    wrapRef.current?.focus();
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return; // editors own their keys
    const rows0 = modelRowsRef.current;
    if (!rows0.length) return;
    const handled = () => { e.preventDefault(); e.stopPropagation(); };
    if (!focus) {
      if (["ArrowDown", "j", "ArrowUp", "k", "Enter"].includes(e.key)) { setFocus({ row: 0, col: null }); handled(); }
      return;
    }
    const rowRec = rows0[focus.row]?.original as RecordRow | undefined;
    if (!rowRec) { setFocus(null); return; }
    // ---- cell level
    if (focus.col !== null) {
      const f = fieldOf(focus.col);
      const move = (dr: number, dc: number) => {
        const i = gridCols.indexOf(focus.col as string);
        setFocus({
          row: Math.max(0, Math.min(focus.row + dr, rows0.length - 1)),
          col: gridCols[Math.max(0, Math.min(i + dc, gridCols.length - 1))],
        });
      };
      if (e.key === "ArrowDown") { move(1, 0); return handled(); }
      if (e.key === "ArrowUp") { move(-1, 0); return handled(); }
      if (e.key === "ArrowRight") { move(0, 1); return handled(); }
      if (e.key === "ArrowLeft") { move(0, -1); return handled(); }
      if (e.key === "Escape") { setFocus({ row: focus.row, col: null }); return handled(); }
      if (!f || readOnly) return;
      if (e.key === "Enter") {
        if (f.primary) { onOpen(rowRec.id); return handled(); }
        if (f.type === "boolean") { onPatch(rowRec.id, { [f.key]: rowRec[f.key] !== true }); return handled(); }
        if (f.type === "select") { (wrapRef.current?.querySelector("td[data-cell-focus] select") as HTMLSelectElement | null)?.focus(); return handled(); }
        if (canKbEdit(f.type)) { setKbEdit({ rowId: rowRec.id, col: f.key, seed: null }); return handled(); }
        return;
      }
      if ((e.key === "Backspace" || e.key === "Delete") && !f.primary) {
        const cleared = clearValue(f);
        if (cleared !== undefined) { onPatch(rowRec.id, { [f.key]: cleared }); return handled(); }
        return;
      }
      if (f.type === "rating" && /^[0-9]$/.test(e.key)) {
        const n = Math.min(Number(e.key), f.scale ?? 5);
        onPatch(rowRec.id, { [f.key]: n });
        return handled();
      }
      // type-to-edit: one motion, the keystroke SEEDS the editor
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && canKbEdit(f.type) && !f.primary) {
        setKbEdit({ rowId: rowRec.id, col: f.key, seed: e.key });
        return handled();
      }
      return;
    }
    // ---- row level
    if (e.key === "ArrowDown" || e.key === "j") { setFocus({ row: Math.min(focus.row + 1, rows0.length - 1), col: null }); return handled(); }
    if (e.key === "ArrowUp" || e.key === "k") { setFocus({ row: Math.max(focus.row - 1, 0), col: null }); return handled(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { onPeek ? onPeek(rowRec.id) : onOpen(rowRec.id); return handled(); }
    if (e.key === "Enter") { setFocus({ row: focus.row, col: gridCols[0] ?? null }); return handled(); }
    if (e.key === "x" && onSelectionChange) {
      if (e.shiftKey && selAnchor.current !== null) {
        const [a, b] = [Math.min(selAnchor.current, focus.row), Math.max(selAnchor.current, focus.row)];
        const next = { ...selection };
        for (let i = a; i <= b; i++) next[(rows0[i].original as RecordRow).id] = true;
        onSelectionChange(next);
      } else {
        selAnchor.current = focus.row;
        onSelectionChange({ ...selection, [rowRec.id]: !selection?.[rowRec.id] });
      }
      return handled();
    }
    if (e.key === "a" && (e.metaKey || e.ctrlKey) && onSelectionChange) {
      onSelectionChange(Object.fromEntries(rows0.map((r) => [(r.original as RecordRow).id, true])));
      return handled();
    }
    if (e.key === "Escape") {
      if (selection && Object.values(selection).some(Boolean) && onSelectionChange) onSelectionChange({});
      else setFocus(null);
      return handled();
    }
  };
  const padTop = vItems && vItems.length ? vItems[0].start : 0;
  const padBottom = vItems && vItems.length ? virtualizer.getTotalSize() - vItems[vItems.length - 1].end : 0;
  const visibleRows = vItems ? vItems.map((vi) => modelRows[vi.index]) : modelRows;

  return (
    <div
      className="nxTableWrap"
      data-testid={`table-${config.key}`}
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onGridKey}
      style={{ outline: "none", ...(virtual ? { maxHeight: "70vh" } : {}) }}
    >
      <table className="nxTable">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const f = config.fields.find((x) => x.key === h.id);
                const numCls = f && (f.type === "number" || f.type === "currency" || f.type === "money") ? "nxNum" : "";
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
          {visibleRows.map((r) => {
            const rowIdx = modelRows.indexOf(r);
            const rowFocused = focus?.row === rowIdx;
            return (
            <tr
              key={r.id}
              data-testid={`row-${(r.original as RecordRow).id}`}
              {...(rowFocused && focus?.col === null ? { "data-row-focus": "" } : {})}
              onClick={() => setFocus((cur) => (cur?.row === rowIdx ? cur : { row: rowIdx, col: null }))}
            >
              {r.getVisibleCells().map((c) => {
                const f = config.fields.find((x) => x.key === c.column.id);
                const numCls = f && (f.type === "number" || f.type === "currency" || f.type === "money") ? "nxNum" : "";
                const cellFocused = rowFocused && focus?.col === c.column.id;
                return (
                  <td key={c.id} className={numCls} {...(cellFocused ? { "data-cell-focus": "" } : {})}>
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                );
              })}
            </tr>
            );
          })}
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
