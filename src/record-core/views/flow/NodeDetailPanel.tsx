import * as React from "react";
import { ArrowUpRight, Trash2, X } from "lucide-react";
import type { FieldDef, ObjectConfig, RecordRow, SelectOption } from "../../types";
import { normalizeOption } from "../../types";
import { formatCell } from "../../DataTable";
import { OptionChip } from "../../options";
import { nodeAccent } from "./nodes";

/* Node-detail panel — the rich menu a node click opens: the record's configured
   fields (typed inline editors, committing through the host store patch path) plus
   record actions (open the full record, delete to trash). Which fields show is
   config (resolveDetailFields). A docked right rail on desktop, a bottom sheet at
   390px; every control is themed to --nx-* and re-derives on skin change. */

interface Props {
  object: ObjectConfig;
  row: RecordRow;
  fields: FieldDef[];
  colorField?: FieldDef;
  readOnly: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
  /* jump the canvas to a related record node (graph-native relation links) */
  onJump?: (id: string) => void;
}

/* a self-relation's targets rendered as clickable chips that recenter the graph
   on that node (ids from _refs, labels from the projected value) */
function RelationJumpCells({ field, row, onJump }: { field: FieldDef; row: RecordRow; onJump: (id: string) => void }) {
  const refs = (row._refs as Record<string, unknown> | undefined)?.[field.key];
  const ids = (Array.isArray(refs) ? refs : refs != null ? [refs] : []).map(String);
  const labelsRaw = row[field.key];
  const labels = Array.isArray(labelsRaw) ? labelsRaw.map(String) : labelsRaw != null ? [String(labelsRaw)] : [];
  if (!ids.length) return <span className="nxFlowDetailRO">—</span>;
  return (
    <div className="nxFlowJumpCells">
      {ids.map((id, i) => (
        <button
          key={id}
          type="button"
          className="nxFlowJumpChip"
          data-testid={`flow-detail-jump-${id}`}
          onClick={() => onJump(id)}
          title="Show on the graph"
        >
          {labels[i] ?? id}
        </button>
      ))}
    </div>
  );
}

/* one editable control per field type — text/number/select/date/boolean commit on
   change or blur; types without a simple editor (relations, json) show read-only */
function FieldEditor({
  field,
  row,
  readOnly,
  onCommit,
}: {
  field: FieldDef;
  row: RecordRow;
  readOnly: boolean;
  onCommit: (value: unknown) => void;
}) {
  const raw = row[field.key];
  const id = `flow-detail-${field.key}`;

  if (readOnly || field.type === "relation" || field.type === "json" || field.type === "array") {
    if (field.type === "select") return <OptionChip field={field} value={raw} testid={`${id}-ro`} />;
    return <span className="nxFlowDetailRO" data-testid={`${id}-ro`}>{formatCell(raw, field.type) || "—"}</span>;
  }

  switch (field.type) {
    case "select": {
      const opts = (field.options ?? []).map((o: SelectOption) => normalizeOption(o));
      return (
        <select
          className="nxFlowDetailInput"
          data-testid={id}
          value={String(raw ?? "")}
          onChange={(e) => onCommit(e.target.value || null)}
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
    }
    case "boolean":
      return (
        <input
          type="checkbox"
          className="nxFlowDetailCheck"
          data-testid={id}
          checked={Boolean(raw)}
          onChange={(e) => onCommit(e.target.checked)}
        />
      );
    case "number":
    case "currency":
    case "rating": {
      const [v, setV] = React.useState(raw == null ? "" : String(raw));
      React.useEffect(() => setV(raw == null ? "" : String(raw)), [raw]);
      return (
        <input
          type="number"
          className="nxFlowDetailInput"
          data-testid={id}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onCommit(v === "" ? null : Number(v))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      );
    }
    case "date":
    case "dateTime": {
      const asDate = typeof raw === "string" ? raw.slice(0, 10) : "";
      return (
        <input
          type="date"
          className="nxFlowDetailInput"
          data-testid={id}
          defaultValue={asDate}
          onChange={(e) => onCommit(e.target.value || null)}
        />
      );
    }
    default: {
      // text / longText / email / url
      const [v, setV] = React.useState(raw == null ? "" : String(raw));
      React.useEffect(() => setV(raw == null ? "" : String(raw)), [raw]);
      return (
        <input
          type="text"
          className="nxFlowDetailInput"
          data-testid={id}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => onCommit(v)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      );
    }
  }
}

export default function NodeDetailPanel({
  object,
  row,
  fields,
  colorField,
  readOnly,
  onPatch,
  onOpen,
  onDelete,
  onClose,
  onJump,
}: Props) {
  const [confirmDel, setConfirmDel] = React.useState(false);
  const accent = nodeAccent(colorField, row);
  const primary = object.fields.find((f) => f.primary);
  const title = (primary && formatCell(row[primary.key], primary.type)) || String(row.id);

  return (
    <aside
      className="nxFlowDetail nx-rise-in"
      data-testid="flow-detail-panel"
      role="dialog"
      aria-label={`${object.labelOne} details`}
      style={{ "--nx-node-accent": accent ?? "var(--nx-accent)" } as React.CSSProperties}
    >
      <header className="nxFlowDetailHead">
        <span className="nxFlowDetailDot" aria-hidden />
        <b data-testid="flow-detail-title" title={title}>{title}</b>
        <button
          type="button"
          className="nxIconBtn"
          data-testid="flow-detail-close"
          aria-label="Close details"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>

      <div className="nxFlowDetailFields">
        {fields.map((f) => (
          <div className="nxFlowDetailRow" key={f.key}>
            <label className="nxFlowDetailLabel" htmlFor={`flow-detail-${f.key}`}>{f.label}</label>
            {onJump && f.type === "relation" && f.relation === object.key ? (
              <RelationJumpCells field={f} row={row} onJump={onJump} />
            ) : (
              <FieldEditor field={f} row={row} readOnly={readOnly} onCommit={(v) => onPatch(String(row.id), { [f.key]: v })} />
            )}
          </div>
        ))}
      </div>

      <footer className="nxFlowDetailActions">
        <button
          type="button"
          className="nxBtn nxBtnPrimary"
          data-testid="flow-detail-open"
          onClick={() => onOpen(String(row.id))}
        >
          <ArrowUpRight size={14} /> Open record
        </button>
        {!readOnly && onDelete && (
          confirmDel ? (
            <span className="nxFlowDetailConfirm">
              <button
                type="button"
                className="nxBtn nxBtnDanger"
                data-testid="flow-detail-delete-confirm"
                onClick={() => { onDelete(String(row.id)); onClose(); }}
              >
                Delete
              </button>
              <button type="button" className="nxBtn" onClick={() => setConfirmDel(false)}>Cancel</button>
            </span>
          ) : (
            <button
              type="button"
              className="nxBtn nxBtnGhostDanger"
              data-testid="flow-detail-delete"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          )
        )}
      </footer>
    </aside>
  );
}
