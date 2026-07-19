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
import type { ObjectConfig, RecordRow } from "./types";
import "./record-core.css";

/* KanbanBoard — columns from the config's stageField options; drag commits a PATCH
   of the stage field (the VISIBLE outcome journeys assert). */

function Card({ row, config, onOpen }: { row: RecordRow; config: ObjectConfig; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  const primary = config.fields.find((f) => f.primary) ?? config.fields[0];
  const metaFields = config.fields.filter((f) => !f.primary && f.key !== config.stageField).slice(0, 2);
  const fmt = (f: (typeof metaFields)[number]) => {
    const v = row[f.key];
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
      <div className="nxKTitle">{String(row[primary.key] ?? "—")}</div>
      <div className="nxKMeta">
        {metaFields.map((f) => (
          <span key={f.key}>{fmt(f)}</span>
        ))}
      </div>
    </div>
  );
}

function Column({
  stage,
  rows,
  config,
  onOpen,
}: {
  stage: string;
  rows: RecordRow[];
  config: ObjectConfig;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}` });
  return (
    <div ref={setNodeRef} className={`nxKCol ${isOver ? "nxKCol--over" : ""}`} data-testid={`col-${stage}`}>
      <div className="nxKColHead">
        <span style={{ fontWeight: 600 }}>{stage}</span>
        <Badge>{rows.length}</Badge>
      </div>
      <div className="nxKCards">
        {rows.map((r) => (
          <Card key={r.id} row={r} config={config} onOpen={onOpen} />
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
}: {
  config: ObjectConfig;
  rows: RecordRow[];
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onOpen: (id: string) => void;
}) {
  const stageField = config.fields.find((f) => f.key === config.stageField);
  const stages = stageField?.options ?? [];
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = rows.find((r) => r.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const over = e.over?.id;
    if (typeof over === "string" && over.startsWith("col:") && stageField) {
      const stage = over.slice(4);
      const row = rows.find((r) => r.id === e.active.id);
      if (row && row[stageField.key] !== stage) onPatch(String(e.active.id), { [stageField.key]: stage });
    }
  };

  if (!stageField) return <div className="nxCard" style={{ padding: 20 }}>This object has no stage field — kanban unavailable.</div>;

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd}>
      <div className="nxKanban" data-testid={`kanban-${config.key}`}>
        {stages.map((s) => (
          <Column key={s} stage={s} config={config} onOpen={onOpen} rows={rows.filter((r) => r[stageField.key] === s)} />
        ))}
      </div>
      <DragOverlay>{active && <div className="nxKCard"><div className="nxKTitle">{String(active[(config.fields.find((f) => f.primary) ?? config.fields[0]).key] ?? "")}</div></div>}</DragOverlay>
    </DndContext>
  );
}
