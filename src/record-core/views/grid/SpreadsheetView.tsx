import * as React from "react";
import {
  CompactSelection,
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type EditListItem,
  type GridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import "./grid.css";
import type { FieldDef } from "../../types";
import { normalizeOption } from "../../types";
import { activeFields, optionMeta } from "../../options";
import { formatCell } from "../../DataTable";
import type { ViewProps } from "../types";
import { cellDescFor, coerceFromText, textForCopy } from "./cells";
import { useGridTheme, type ChipColors } from "./theme";
import { gridRenderers, type ChipDatum, type MultiselectCell, type SelectCell, type UserCell } from "./renderers";
import { provideGridEditor } from "./editors";

/* SpreadsheetView — Excel-grade bulk editing over an object's records:
   fill-handle, range selection, TSV copy/paste, keyboard cell-nav, frozen
   primary column. A thin wrapper over glide-data-grid: every commit routes
   through onPatch (the same store path the table uses), one merged patch per
   touched row. Read-only field types render formatted; a paste/fill value a
   field cannot hold is skipped, never written. */

const SKIP = Symbol("skip");

export default function SpreadsheetView({
  object, rows, users, readOnly, onPatch, selection, onSelectionChange,
}: ViewProps) {
  const { theme, chips, selectionText } = useGridTheme();
  const hasSelText = Object.keys(selectionText).length > 0;

  /* latest cell selection, read at DRAW time so the stable getCellContent can
     give selected cells a contrast-safe text override without re-identifying
     on every selection move */
  const selRef = React.useRef<GridSelection | null>(null);

  /* does glide paint this cell with the accent selection fill? (active cell +
     range + rangeStack + fully-selected rows/cols — the exact set glide tints,
     so the override lands on precisely those cells and no others) */
  const isSelectionFilled = React.useCallback((col: number, row: number): boolean => {
    const sel = selRef.current;
    if (!sel) return false;
    const cur = sel.current;
    if (cur) {
      const inRect = (r: { x: number; y: number; width: number; height: number }) =>
        col >= r.x && col < r.x + r.width && row >= r.y && row < r.y + r.height;
      if (inRect(cur.range)) return true;
      for (const r of cur.rangeStack) if (inRect(r)) return true;
    }
    return sel.rows.hasIndex(row) || sel.columns.hasIndex(col);
  }, []);

  // primary first — it is the frozen identity column
  const fields = React.useMemo(() => {
    const act = activeFields(object.fields);
    const prim = act.find((f) => f.primary) ?? act[0];
    return prim ? [prim, ...act.filter((f) => f !== prim)] : act;
  }, [object.fields]);

  const columns: GridColumn[] = React.useMemo(
    () => fields.map((f) => ({ id: f.key, title: f.label, width: f.width ?? 160 })),
    [fields],
  );

  // glide's overlay editors portal into #portal (its documented integration div)
  React.useEffect(() => {
    if (document.getElementById("portal") === null) {
      const el = document.createElement("div");
      el.id = "portal";
      document.body.appendChild(el);
    }
  }, []);

  const chipFor = (f: FieldDef, value: unknown): ChipDatum | null => {
    const meta = optionMeta(f, value);
    if (!meta.value) return null;
    const c: ChipColors = chips[meta.color ?? "none"] ?? chips.none;
    return { label: meta.label, bg: c.bg, fg: c.fg };
  };

  const buildCell = React.useCallback((f: FieldDef, value: unknown): GridCell => {
    const desc = cellDescFor(f);
    const editable = desc.kind !== "readonly" && desc.editable && !readOnly;
    switch (desc.kind) {
      case "number":
        return {
          kind: GridCellKind.Number,
          data: typeof value === "number" ? value : undefined,
          displayData: formatCell(value, f.type),
          allowOverlay: editable,
          readonly: !editable,
        };
      case "boolean":
        return { kind: GridCellKind.Boolean, data: value === true, allowOverlay: false, readonly: !editable };
      case "uri":
        return {
          kind: GridCellKind.Uri,
          data: String(value ?? ""),
          allowOverlay: editable,
          readonly: !editable,
        };
      case "select": {
        const cell: SelectCell = {
          kind: GridCellKind.Custom,
          data: { kind: "nx-select", value: String(value ?? ""), chip: chipFor(f, value), options: f.options ?? [] },
          copyData: textForCopy(f, value),
          allowOverlay: editable,
        };
        return cell;
      }
      case "multiselect": {
        const values = Array.isArray(value) ? value.map(String) : [];
        const cell: MultiselectCell = {
          kind: GridCellKind.Custom,
          data: {
            kind: "nx-multiselect",
            values,
            chips: values.map((v) => chipFor(f, v)).filter((c): c is ChipDatum => c !== null),
            options: f.options ?? [],
          },
          copyData: textForCopy(f, values),
          allowOverlay: editable,
        };
        return cell;
      }
      case "user": {
        const cell: UserCell = {
          kind: GridCellKind.Custom,
          data: {
            kind: "nx-user",
            value: String(value ?? ""),
            users,
            avatar: { bg: theme.accentLight ?? "", fg: theme.accentColor ?? "" },
          },
          copyData: textForCopy(f, value),
          allowOverlay: editable,
        };
        return cell;
      }
      case "text":
      default:
        return {
          kind: GridCellKind.Text,
          data: String(value ?? ""),
          displayData: formatCell(value, f.type) || "",
          allowOverlay: editable,
          readonly: !editable,
        };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, users, chips, theme.accentLight, theme.accentColor]);

  const getCellContent = React.useCallback(
    ([col, row]: Item): GridCell => {
      const f = fields[col];
      const rec = rows[row];
      if (!f || !rec) return { kind: GridCellKind.Text, data: "", displayData: "", allowOverlay: false };
      const cell = buildCell(f, rec[f.key]);
      // a selected cell sits on the accent fill — flip its text ramp for contrast
      if (hasSelText && isSelectionFilled(col, row)) {
        return { ...cell, themeOverride: { ...cell.themeOverride, ...selectionText } } as GridCell;
      }
      return cell;
    },
    [fields, rows, buildCell, hasSelText, isSelectionFilled, selectionText],
  );

  /* an incoming edited cell → the raw field value. A same-kind cell hands its
     typed value over; a MISMATCHED kind (a fill dragged across columns) falls
     back to its text and re-coerces against the TARGET field — an impossible
     value is skipped, never written. */
  const rawFromCell = (f: FieldDef, cell: EditableGridCell): unknown | typeof SKIP => {
    const desc = cellDescFor(f);
    if (desc.kind === "readonly" || !desc.editable || readOnly) return SKIP;
    const asText = (): string => {
      if (cell.kind === GridCellKind.Custom) return String(cell.copyData ?? "");
      if (cell.kind === GridCellKind.Boolean) return cell.data === true ? "true" : "false";
      return String((cell as { data?: unknown }).data ?? "");
    };
    switch (desc.kind) {
      case "text":
        if (cell.kind === GridCellKind.Text || cell.kind === GridCellKind.Uri) return cell.data ?? "";
        break;
      case "uri":
        if (cell.kind === GridCellKind.Uri || cell.kind === GridCellKind.Text) return cell.data ?? "";
        break;
      case "number":
        if (cell.kind === GridCellKind.Number) return cell.data ?? null;
        break;
      case "boolean":
        if (cell.kind === GridCellKind.Boolean) return cell.data === true;
        break;
      case "select":
        if (cell.kind === GridCellKind.Custom && (cell.data as { kind?: string }).kind === "nx-select")
          return (cell.data as SelectCell["data"]).value;
        break;
      case "multiselect":
        if (cell.kind === GridCellKind.Custom && (cell.data as { kind?: string }).kind === "nx-multiselect")
          return (cell.data as MultiselectCell["data"]).values;
        break;
      case "user":
        if (cell.kind === GridCellKind.Custom && (cell.data as { kind?: string }).kind === "nx-user")
          return (cell.data as UserCell["data"]).value;
        break;
    }
    const co = coerceFromText(f, asText(), users);
    return co.ok ? co.value : SKIP;
  };

  // one merged patch per touched row — single edits, fills and pastes all land here
  const commit = (items: readonly { location: Item; value: EditableGridCell }[]) => {
    const patches = new Map<string, Record<string, unknown>>();
    for (const { location: [c, r], value } of items) {
      const f = fields[c];
      const rec = rows[r];
      if (!f || !rec) continue;
      const raw = rawFromCell(f, value);
      if (raw === SKIP) continue;
      const p = patches.get(rec.id) ?? {};
      p[f.key] = raw;
      patches.set(rec.id, p);
    }
    for (const [id, p] of patches) onPatch(id, p);
  };

  const onCellsEdited = React.useCallback((newValues: readonly EditListItem[]) => {
    commit(newValues);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, rows, readOnly, users]);

  // manual paste: coerce every incoming text against its TARGET field; clip to
  // existing rows/columns (no implicit row creation)
  const onPaste = React.useCallback((target: Item, values: readonly (readonly string[])[]) => {
    if (readOnly) return false;
    const [tc, tr] = target;
    const patches = new Map<string, Record<string, unknown>>();
    values.forEach((rowVals, dr) => {
      rowVals.forEach((text, dc) => {
        const f = fields[tc + dc];
        const rec = rows[tr + dr];
        if (!f || !rec) return;
        const desc = cellDescFor(f);
        if (desc.kind === "readonly" || !desc.editable) return;
        const co = coerceFromText(f, text, users);
        if (!co.ok) return;
        const p = patches.get(rec.id) ?? {};
        p[f.key] = co.value;
        patches.set(rec.id, p);
      });
    });
    for (const [id, p] of patches) onPatch(id, p);
    return false; // handled here; the grid repaints from the store round-trip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, rows, readOnly, users, onPatch]);

  /* ---- row-marker selection ⇄ the host bulk bar (two-way, guarded) ---- */
  const [gridSel, setGridSel] = React.useState<GridSelection>({
    columns: CompactSelection.empty(),
    rows: CompactSelection.empty(),
  });
  selRef.current = gridSel; // keep the draw-time selection ref current every render
  const pushingRef = React.useRef(false);
  const onGridSelectionChange = React.useCallback((sel: GridSelection) => {
    setGridSel(sel);
    const ids: Record<string, boolean> = {};
    for (const i of sel.rows) {
      const rec = rows[i];
      if (rec) ids[rec.id] = true;
    }
    const current = Object.keys(selection).filter((k) => selection[k]).sort().join("|");
    const next = Object.keys(ids).sort().join("|");
    if (current !== next) {
      pushingRef.current = true;
      onSelectionChange(ids);
    }
  }, [rows, selection, onSelectionChange]);
  React.useEffect(() => {
    // host-driven change (bulk bar clear/delete) → rebuild the marker column
    if (pushingRef.current) { pushingRef.current = false; return; }
    let next = CompactSelection.empty();
    rows.forEach((r, i) => { if (selection[r.id]) next = next.add(i); });
    const cur = [...gridSel.rows].join(",");
    if ([...next].join(",") !== cur) setGridSel((s) => ({ ...s, rows: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, rows]);

  return (
    <div className="nxGridWrap" data-testid={`grid-${object.key}`}>
      <DataEditor
        columns={columns}
        rows={rows.length}
        getCellContent={getCellContent}
        onCellsEdited={readOnly ? undefined : onCellsEdited}
        onPaste={readOnly ? false : onPaste}
        fillHandle={!readOnly}
        getCellsForSelection={true}
        freezeColumns={1}
        rowMarkers="checkbox"
        rowMarkerWidth={36}
        rowSelect="multi"
        gridSelection={gridSel}
        onGridSelectionChange={onGridSelectionChange}
        customRenderers={gridRenderers}
        provideEditor={provideGridEditor}
        theme={theme}
        rowHeight={34}
        headerHeight={36}
        smoothScrollX={true}
        smoothScrollY={true}
        width="100%"
        height="100%"
      />
      {rows.length === 0 && (
        <div style={{ padding: 28, textAlign: "center", color: "var(--nx-fg-faint)" }}>
          No {object.label.toLowerCase()} yet.
        </div>
      )}
    </div>
  );
}
