import * as React from "react";
import { formatCell } from "./DataTable";
import { OptionChip, activeFields } from "./options";
import type { FieldDef, ObjectConfig, RecordRow } from "./types";

/* RecordCard — the shared compact record rendering (title + a few meta values) used
   wherever a record shows as a CARD outside the table: map popups, gallery tiles.
   Visual family: the kanban card (nxKTitle/nxKMeta). `fields` picks the meta keys
   (default: the first two active non-primary fields); `titleField` overrides the
   title source (default: the primary field). Select values render as their colored
   OptionChip, multiselect as up to three chips, everything else through formatCell.
   Pure display — pass `onOpen` to make the whole card clickable. */
export function RecordCard({
  object,
  row,
  fields,
  titleField,
  onOpen,
  testid,
}: {
  object: ObjectConfig;
  row: RecordRow;
  fields?: string[];
  titleField?: string;
  onOpen?: (id: string) => void;
  testid?: string;
}) {
  const primary = object.fields.find((f) => f.primary) ?? object.fields[0];
  const title = object.fields.find((f) => f.key === titleField) ?? primary;
  const metaFields = fields
    ? fields.map((k) => object.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f)
    : activeFields(object.fields).filter((f) => !f.primary).slice(0, 2);
  return (
    <div
      className={`nxRecordCard${onOpen ? " nxRecordCard--link" : ""}`}
      data-testid={testid}
      onClick={onOpen ? () => onOpen(row.id) : undefined}
    >
      <div className="nxKTitle">{formatCell(row[title.key], title.type) || "—"}</div>
      {metaFields.length > 0 && (
        <div className="nxKMeta">
          {metaFields.map((f) =>
            f.type === "select" ? (
              <OptionChip key={f.key} field={f} value={row[f.key]} />
            ) : f.type === "multiselect" && Array.isArray(row[f.key]) ? (
              <span key={f.key} className="nxRecordCardChips">
                {(row[f.key] as unknown[]).slice(0, 3).map((v, i) => (
                  <OptionChip key={i} field={f} value={v} />
                ))}
              </span>
            ) : (
              <span key={f.key}>{formatCell(row[f.key], f.type)}</span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
