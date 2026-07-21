import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Badge } from "../primitives/fields";
import { getFieldTypeDefinition } from "./fields/registry";
import type { ObjectConfig, RecordRow } from "./types";
import { measurableValue, optionValues } from "./types";
import { formatCell } from "./DataTable";
import { OptionChip } from "./options";
import "./record-core.css";

/* KanbanBoard — columns from the config's stageField options; drag commits a PATCH
   of the stage field (the VISIBLE outcome journeys assert). */

function Card({ row, config, onOpen, groupKey }: { row: RecordRow; config: ObjectConfig; onOpen: (id: string) => void; groupKey?: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  const primary = config.fields.find((f) => f.primary) ?? config.fields[0];
  const metaFields = config.fields.filter((f) => !f.primary && f.key !== (groupKey ?? config.stageField)).slice(0, 2);
  const fmt = (f: (typeof metaFields)[number]): React.ReactNode => {
    const v = row[f.key];
    // installed field types render their own card cell (a whiteboard thumbnail)
    const Cell = getFieldTypeDefinition(f.type)?.cell;
    if (Cell) return <Cell field={f} row={row} value={v} />;
    if (["money", "emails", "phones", "links", "address", "fullName"].includes(f.type)) return formatCell(v, f.type);
    return (f.type === "number" || f.type === "currency") && typeof v === "number"
      ? new Intl.NumberFormat("en-US").format(v)
      : String(v ?? "");
  };
  return (
    <div
      ref={setNodeRef}
      className={`nxKCard ${isDragging ? "nxKCard--drag" : ""}`}
      data-testid={`card-${row.id}`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(row.id)}
    >
      <div className="nxKTitle">{formatCell(row[primary.key], primary.type) || "—"}</div>
      <div className="nxKMeta">
        {metaFields.map((f) => (
          <span key={f.key}>{fmt(f)}</span>
        ))}
      </div>
    </div>
  );
}

const AGG_FNS = {
  sum: (xs: number[]) => xs.reduce((a, b) => a + b, 0),
  avg: (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0),
  min: (xs: number[]) => (xs.length ? Math.min(...xs) : 0),
  max: (xs: number[]) => (xs.length ? Math.max(...xs) : 0),
};

function Column({
  stage,
  rows,
  config,
  onOpen,
  groupKey,
  aggregate,
}: {
  stage: string;
  rows: RecordRow[];
  config: ObjectConfig;
  onOpen: (id: string) => void;
  groupKey?: string;
  aggregate?: { fn: keyof typeof AGG_FNS; field: string };
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  const aggValue = aggregate
    ? AGG_FNS[aggregate.fn](rows.map((r) => measurableValue(r[aggregate.field])))
    : null;
  return (
    <div ref={setNodeRef} className={`nxKCol ${isOver ? "nxKCol--over" : ""}`} data-testid={`col-${stage}`}>
      <div className="nxKColHead">
        <OptionChip field={config.fields.find((f) => f.key === (groupKey ?? config.stageField))} value={stage} />
        <Badge>{rows.length}</Badge>
        {aggValue !== null && (
          <span
            className="nxCount"
            data-testid={`agg-${stage}`}
            data-value={Math.round(aggValue)}
            style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
          >
            {aggregate!.fn === "avg" ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(aggValue) : new Intl.NumberFormat("en-US").format(aggValue)}
          </span>
        )}
      </div>
      <div className="nxKCards">
        {rows.map((r) => (
          <Card key={r.id} row={r} config={config} onOpen={onOpen} groupKey={groupKey} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  config,
  rows,
  onPatch,
  onOpen,
  groupField,
  groupOptions,
  readOnly,
  aggregate,
}: {
  config: ObjectConfig;
  rows: RecordRow[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
  /* group by ANY select/user field — defaults to the config's stageField */
  groupField?: string;
  /* column set override (required for `user` fields — options live in app config) */
  groupOptions?: string[];
  /* permission-driven: cards stay clickable, dragging is off */
  readOnly?: boolean;
  /* per-column rollup shown in every column head: fn over a numeric field */
  aggregate?: { fn: "sum" | "avg" | "min" | "max"; field: string };
}) {
  const groupKey = groupField ?? config.stageField;
  const stageField = config.fields.find((f) => f.key === groupKey);
  const stages = groupOptions ?? optionValues(stageField?.options);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = rows.find((r) => r.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (readOnly) return;
    const over = e.over?.id;
    if (typeof over === "string" && over.startsWith("col:") && stageField) {
      const stage = over.slice(4);
      const row = rows.find((r) => r.id === e.active.id);
      if (row && row[stageField.key] !== stage) onPatch(String(e.active.id), { [stageField.key]: stage });
    }
  };

  if (!stageField) return <div className="nxCard" style={{ padding: 20 }}>This object has no groupable field — board unavailable.</div>;

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
      <div className="nxKanban" data-testid={`kanban-${config.key}`}>
        {stages.map((s) => (
          <Column key={s} stage={s} config={config} onOpen={onOpen} groupKey={groupKey} aggregate={aggregate} rows={rows.filter((r) => r[stageField.key] === s)} />
        ))}
      </div>
      <DragOverlay>{active && (() => { const p = config.fields.find((f) => f.primary) ?? config.fields[0]; return <div className="nxKCard nxKCard--overlay"><div className="nxKTitle">{formatCell(active[p.key], p.type)}</div></div>; })()}</DragOverlay>
    </DndContext>
  );
}
