import * as React from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "../../../components/ui/drawer";
import { Dialog } from "../../../primitives/overlays";
import { Button } from "../../../primitives/Button";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { ObjectConfig, RecordRow } from "../../types";
import { normalizeOption, optionValues } from "../../types";
import { activeFields, chipStyle, optionMeta } from "../../options";
import type { CalendarFields } from "./events";
import { isDateOnly } from "./events";

/* Quick event editor — the click/tap surface for a calendar event. A centered
   Dialog on desktop, a bottom Drawer at ≤768px (both vendored, no floating-ui, so
   neither inherits the app's Radix-popper positioning defect). Edits the record's
   own stored representation (a `date` value or an ISO instant / a date-only value
   for an all-day event on a `dateTime` field) and writes through the host store:
   Save → onPatch, Delete → onDelete (behind an inline confirm), Open full record →
   onOpen (the peek). Render-only recurrence: the recurrence field is not editable
   here (Open full record covers it). All strings route through the passed labels;
   the object's own field labels are the copy. */

/* stored value → a <input type=date> value */
const toDay = (v: unknown): string => (typeof v === "string" ? v.slice(0, 10) : "");

/* stored ISO instant → a <input type=datetime-local> value in LOCAL wall-clock */
const toLocal = (v: unknown): string => {
  if (typeof v !== "string" || v === "") return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* a <input type=datetime-local> value → a stored ISO instant */
const fromLocal = (v: string): string => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
};

export interface EventEditDialogProps {
  object: ObjectConfig;
  row: RecordRow;
  fields: CalendarFields;
  /* config editability AND permission already ANDed by CalendarView */
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete?: (id: string) => void;
  onOpen: (id: string) => void;
}

export function EventEditDialog({
  object,
  row,
  fields,
  canEdit,
  canDelete,
  onClose,
  onPatch,
  onDelete,
  onOpen,
}: EventEditDialogProps) {
  const isMobile = useIsMobile();
  const id = String(row.id);
  const dateField = fields.start.type === "date"; // an all-day-only object (no toggle)

  // the event is all-day when its own start value is date-only (or the field is date)
  const initialAllDay = dateField || isDateOnly(row[fields.start.key]);
  const [allDay, setAllDay] = React.useState(initialAllDay);
  const [title, setTitle] = React.useState(String(row[fields.title.key] ?? ""));
  const [start, setStart] = React.useState(() =>
    initialAllDay ? toDay(row[fields.start.key]) : toLocal(row[fields.start.key]),
  );
  const [end, setEnd] = React.useState(() =>
    fields.end ? (initialAllDay ? toDay(row[fields.end.key]) : toLocal(row[fields.end.key])) : "",
  );
  const [color, setColor] = React.useState(fields.color ? String(row[fields.color.key] ?? "") : "");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // other quick fields: the object's remaining simple fields (full editing lives
  // behind "Open full record")
  const quick = React.useMemo(() => {
    const used = new Set(
      [fields.start.key, fields.end?.key, fields.title.key, fields.color?.key, fields.recurrence?.key].filter(
        Boolean,
      ) as string[],
    );
    return activeFields(object.fields).filter(
      (fld) => !used.has(fld.key) && (fld.type === "text" || fld.type === "number" || fld.type === "select"),
    );
  }, [object, fields]);
  const [quickVals, setQuickVals] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(quick.map((fld) => [fld.key, String(row[fld.key] ?? "")])),
  );

  const toggleAllDay = (next: boolean) => {
    setAllDay(next);
    // convert the in-progress start/end between the two input shapes
    setStart((s) => (next ? s.slice(0, 10) : s.length === 10 ? `${s}T09:00` : s));
    setEnd((e) => (!e ? e : next ? e.slice(0, 10) : e.length === 10 ? `${e}T10:00` : e));
  };

  const storeVal = (raw: string) => (allDay ? raw : fromLocal(raw));

  const save = () => {
    const patch: Record<string, unknown> = { [fields.title.key]: title };
    patch[fields.start.key] = storeVal(start);
    if (fields.end && end) patch[fields.end.key] = storeVal(end);
    if (fields.color) patch[fields.color.key] = color || null;
    for (const fld of quick) {
      const v = quickVals[fld.key] ?? "";
      patch[fld.key] = fld.type === "number" ? (v === "" ? null : Number(v)) : v;
    }
    onPatch(id, patch);
    onClose();
  };

  const del = () => {
    onDelete?.(id);
    onClose();
  };

  const colorOptions = fields.color ? optionValues(fields.color.options) : [];

  const body = (
    <div className="nxCalEdit" data-testid="calendar-edit">
      <label className="nxCalEditField">
        <span>{fields.title.label}</span>
        <input
          className="nxCalEditInput"
          data-testid="edit-title"
          value={title}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>

      {!dateField && (
        <label className="nxCalEditToggle">
          <input
            type="checkbox"
            data-testid="edit-allday"
            checked={allDay}
            disabled={!canEdit}
            onChange={(e) => toggleAllDay(e.target.checked)}
          />
          <span>All day</span>
        </label>
      )}

      <div className="nxCalEditRow">
        <label className="nxCalEditField">
          <span>{fields.start.label}</span>
          <input
            className="nxCalEditInput"
            data-testid="edit-start"
            type={allDay ? "date" : "datetime-local"}
            value={start}
            disabled={!canEdit}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        {fields.end && (
          <label className="nxCalEditField">
            <span>{fields.end.label}</span>
            <input
              className="nxCalEditInput"
              data-testid="edit-end"
              type={allDay ? "date" : "datetime-local"}
              value={end}
              disabled={!canEdit}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
      </div>

      {fields.color && (
        <div className="nxCalEditField">
          <span>{fields.color.label}</span>
          <div className="nxCalEditColors" role="group" aria-label={fields.color.label}>
            {colorOptions.map((opt) => {
              const meta = optionMeta(fields.color, opt);
              const active = color === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  className="nxCalEditColor"
                  data-testid={`edit-color-${opt}`}
                  data-active={active}
                  aria-pressed={active}
                  disabled={!canEdit}
                  style={chipStyle(meta.color)}
                  onClick={() => setColor(active ? "" : opt)}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {quick.map((fld) => (
        <label className="nxCalEditField" key={fld.key}>
          <span>{fld.label}</span>
          {fld.type === "select" ? (
            <select
              className="nxCalEditInput"
              data-testid={`edit-field-${fld.key}`}
              value={quickVals[fld.key] ?? ""}
              disabled={!canEdit}
              onChange={(e) => setQuickVals((q) => ({ ...q, [fld.key]: e.target.value }))}
            >
              <option value="">—</option>
              {(fld.options ?? []).map(normalizeOption).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="nxCalEditInput"
              data-testid={`edit-field-${fld.key}`}
              inputMode={fld.type === "number" ? "decimal" : undefined}
              value={quickVals[fld.key] ?? ""}
              disabled={!canEdit}
              onChange={(e) => setQuickVals((q) => ({ ...q, [fld.key]: e.target.value }))}
            />
          )}
        </label>
      ))}
    </div>
  );

  const footer = (
    <div className="nxCalEditActions">
      {canDelete && onDelete && (
        confirmingDelete ? (
          <span className="nxCalEditConfirm" data-testid="edit-delete-confirm">
            <span>Delete this {object.labelOne?.toLowerCase() ?? "record"}?</span>
            <Button size="sm" variant="ghost" data-testid="edit-delete-cancel" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" data-testid="edit-delete-go" onClick={del}>
              Delete
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            icon={<Trash2 size={14} />}
            data-testid="edit-delete"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        )
      )}
      <span className="nxCalEditSpacer" />
      <Button
        size="sm"
        variant="ghost"
        icon={<ExternalLink size={14} />}
        data-testid="edit-open-record"
        onClick={() => {
          onOpen(id);
          onClose();
        }}
      >
        Open full record
      </Button>
      {canEdit && (
        <Button size="sm" variant="primary" data-testid="edit-save" onClick={save}>
          Save
        </Button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => { if (!o) onClose(); }}>
        <DrawerContent data-testid="calendar-edit-sheet">
          <DrawerHeader>
            <DrawerTitle>{fields.title.label || "Event"}</DrawerTitle>
          </DrawerHeader>
          <div className="nxCalEditBody">{body}</div>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={fields.title.label || "Event"} footer={footer}>
      {body}
    </Dialog>
  );
}
