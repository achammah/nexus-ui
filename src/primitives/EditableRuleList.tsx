import * as React from "react";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";
import type { RecordRow } from "../record-core/types";
import "./primitives.css";

/* Generic editable-list-of-rules primitive — inline add/edit card + severity chip +
   active toggle over ANY object's rows. No fetch inside: the caller wires
   onCreate/onPatch/onRemove exactly like record-core wires DataTable's onPatch —
   this component only renders + calls back. Field shape and the severity enum
   (with its colors) are all props, so any app's rule/policy/config list fits. */

export interface SeverityOption {
  value: string;
  label?: string;
  color: string;
}

export interface EditableRuleListProps {
  /* used only for testid namespacing (`<objectKey>-add`, `<objectKey>-row-<id>`…) */
  objectKey: string;
  rows: RecordRow[] | null;
  textField: string;
  severityField?: string;
  severityOptions?: SeverityOption[];
  /* boolean field; omit to hide the active toggle entirely */
  activeField?: string;
  onCreate: (body: Record<string, unknown>) => Promise<unknown>;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  placeholder?: string;
  addLabel?: string;
  emptyLabel?: string;
}

const f = (r: RecordRow, k: string) => (r as Record<string, unknown>)[k];

export function EditableRuleList({
  objectKey,
  rows,
  textField,
  severityField,
  severityOptions,
  activeField,
  onCreate,
  onPatch,
  onRemove,
  placeholder = "Add a rule…",
  addLabel = "Add rule",
  emptyLabel = "No rules yet. Add the first one.",
}: EditableRuleListProps) {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [busy, setBusy] = React.useState(false);

  const defaultDraft = React.useCallback((): Record<string, unknown> => {
    const d: Record<string, unknown> = { [textField]: "" };
    if (severityField) d[severityField] = severityOptions?.[0]?.value ?? "";
    if (activeField) d[activeField] = true;
    return d;
  }, [textField, severityField, severityOptions, activeField]);

  const startEdit = (r: RecordRow) => {
    setEditing(r.id as string);
    setAdding(false);
    const d: Record<string, unknown> = { [textField]: String(f(r, textField) ?? "") };
    if (severityField) d[severityField] = String(f(r, severityField) ?? severityOptions?.[0]?.value ?? "");
    if (activeField) d[activeField] = f(r, activeField) !== false;
    setDraft(d);
  };
  const startAdd = () => { setAdding(true); setEditing(null); setDraft(defaultDraft()); };
  const cancel = () => { setEditing(null); setAdding(false); };

  async function save() {
    const text = String(draft[textField] ?? "").trim();
    if (!text) return;
    setBusy(true);
    try {
      if (adding) await onCreate({ ...draft, [textField]: text });
      else if (editing) await onPatch(editing, { ...draft, [textField]: text });
      cancel();
    } finally {
      setBusy(false);
    }
  }
  async function del(id: string) {
    setBusy(true);
    try { await onRemove(id); } finally { setBusy(false); }
  }

  const sevColor = (v: unknown) => severityOptions?.find((s) => s.value === v)?.color ?? "var(--nx-fg-muted)";

  const editor = (
    <div className="nxRuleEditor">
      <textarea
        className="nxRuleInput"
        data-testid={`${objectKey}-input`}
        value={String(draft[textField] ?? "")}
        placeholder={placeholder}
        rows={3}
        autoFocus
        onChange={(e) => setDraft((d) => ({ ...d, [textField]: e.target.value }))}
      />
      <div className="nxRuleEditRow">
        {severityField && severityOptions && (
          <select
            className="nxInput nxRuleSev"
            value={String(draft[severityField] ?? "")}
            onChange={(e) => setDraft((d) => ({ ...d, [severityField]: e.target.value }))}
          >
            {severityOptions.map((s) => <option key={s.value} value={s.value}>{s.label ?? s.value}</option>)}
          </select>
        )}
        {activeField && (
          <label className="nxRuleActive">
            <input
              type="checkbox"
              checked={draft[activeField] !== false}
              onChange={(e) => setDraft((d) => ({ ...d, [activeField]: e.target.checked }))}
            />
            active
          </label>
        )}
        <span className="nxGrow" />
        <button type="button" className="nxRuleBtn acc" data-testid={`${objectKey}-save`} disabled={busy} onClick={save}>
          <Check size={13} /> Save
        </button>
        <button type="button" className="nxRuleBtn" data-testid={`${objectKey}-cancel`} onClick={cancel}>
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="nxRuleList">
      <div className="nxRuleTop">
        <div className="nxRuleCount">{rows ? rows.length : "…"} rules</div>
        <button type="button" className="nxRuleAdd" data-testid={`${objectKey}-add`} onClick={startAdd}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>
      {adding && editor}
      <div className="nxRuleRows">
        {rows?.map((r) => editing === (r.id as string) ? (
          <React.Fragment key={r.id as string}>{editor}</React.Fragment>
        ) : (
          <div
            key={r.id as string}
            className={`nxRuleRow${activeField && f(r, activeField) === false ? " is-off" : ""}`}
            data-testid={`${objectKey}-row-${r.id}`}
          >
            {severityField && (
              <span className="nxRuleSevChip" style={{ color: sevColor(f(r, severityField)), borderColor: sevColor(f(r, severityField)) }}>
                {String(f(r, severityField) ?? "")}
              </span>
            )}
            <span className="nxRuleText">{String(f(r, textField) ?? "")}</span>
            <span className="nxGrow" />
            <button type="button" className="nxRuleIco" aria-label="Edit" data-testid={`${objectKey}-edit-${r.id}`} onClick={() => startEdit(r)}>
              <Pencil size={14} />
            </button>
            <button type="button" className="nxRuleIco" aria-label="Delete" data-testid={`${objectKey}-del-${r.id}`} onClick={() => del(r.id as string)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {rows && rows.length === 0 && !adding && <div className="nxRuleEmpty">{emptyLabel}</div>}
      </div>
    </div>
  );
}
