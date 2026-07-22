import * as React from "react";
import { addDays } from "date-fns";
import { ChevronDown, ChevronRight, CalendarPlus, Plus, Repeat } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { RecordRow } from "../../types";
import { normalizeOption } from "../../types";
import { activeFields, OptionChip, optionMeta } from "../../options";
import {
  buildTaskTree, doneStatusValues, flattenTree, isoDay, parseDay, subtaskRollup,
  taskHealth, TASK_KEYS, type TaskFieldKeys, type TaskNode,
} from "../../tasks";
import type { ViewProps } from "../types";
import {
  computeRange, criticalPath, depEdges, headerCells, PX_PER_DAY, taskSpan,
  weekendOffsets, type TaskSpan, type TimelineZoom,
} from "./model";
import "./timeline.css";

/* Timeline (Gantt) view — tasks on a time axis: tree rail left (expand/collapse,
   inline status/assignee/due editors, quick-add, selection), bars right with
   drag-to-reschedule + resize, dependency arrows, today marker, weekend shading,
   overdue/at-risk/blocked styling and critical-path emphasis.
   State keys in the bag: `tlZoom` · `tlCollapsed` (id→true) · `tlAssignee`. */

const ROW_H = 36;

type Keys = TaskFieldKeys;

export function resolveKeys(object: ViewProps["object"], cfg: Record<string, unknown>): Keys {
  const fields = activeFields(object.fields);
  const has = (k: unknown) => typeof k === "string" && fields.some((f) => f.key === k);
  const firstOf = (...types: string[]) => fields.find((f) => types.includes(f.type))?.key ?? "";
  const dates = fields.filter((f) => f.type === "date" || f.type === "dateTime").map((f) => f.key);
  const pick = (cfgKey: string, fallback: string) => (has(cfg[cfgKey]) ? (cfg[cfgKey] as string) : fallback);
  const def = (k: string, alt: string) => (fields.some((f) => f.key === k) ? k : alt);
  return {
    title: pick("titleField", (fields.find((f) => f.primary) ?? fields[0])?.key ?? "title"),
    status: pick("statusField", def(TASK_KEYS.status, object.stageField ?? firstOf("select"))),
    assignee: pick("assigneeField", def(TASK_KEYS.assignee, firstOf("user"))),
    priority: def(TASK_KEYS.priority, ""),
    labels: def(TASK_KEYS.labels, ""),
    startDate: pick("startDateField", def(TASK_KEYS.startDate, dates[0] ?? "")),
    dueDate: pick("dueDateField", def(TASK_KEYS.dueDate, dates[1] ?? dates[0] ?? "")),
    estimate: def(TASK_KEYS.estimate, ""),
    progress: pick("progressField", def(TASK_KEYS.progress, "")),
    description: def(TASK_KEYS.description, ""),
    parent: pick("parentField", def(TASK_KEYS.parent, "")),
    blockedBy: pick("dependenciesField", def(TASK_KEYS.blockedBy, "")),
    repeat: def(TASK_KEYS.repeat, ""),
    timeEntries: def(TASK_KEYS.timeEntries, ""),
    timeSpent: def(TASK_KEYS.timeSpent, ""),
    plannedFor: def(TASK_KEYS.plannedFor, ""),
    focusOrder: def(TASK_KEYS.focusOrder, ""),
  };
}

/* drag session: bar move / edge resize, in whole days */
type Drag = { id: string; mode: "move" | "start" | "end"; originX: number; dx: number };

export default function TimelineView(props: ViewProps) {
  const { object, rows, users, readOnly, viewConfig, viewState, onViewState, onOpen, onPatch, onCreate, onCreateDraft, selection, onSelectionChange } = props;
  const isMobile = useIsMobile();
  const keys = React.useMemo(() => resolveKeys(object, viewConfig), [object, viewConfig]);
  const statusField = object.fields.find((f) => f.key === keys.status);
  const done = React.useMemo(
    () => doneStatusValues(statusField, (viewConfig.doneStatuses as string)?.split?.(",").map((s: string) => s.trim()).filter(Boolean)),
    [statusField, viewConfig.doneStatuses],
  );
  const today = React.useMemo(() => new Date(), []);

  const zoom: TimelineZoom = (["day", "week", "month", "quarter"] as const).includes(viewState.tlZoom as TimelineZoom)
    ? (viewState.tlZoom as TimelineZoom)
    : isMobile ? "month" : (viewConfig.defaultZoom as TimelineZoom) || "week";
  const collapsed = (viewState.tlCollapsed as Record<string, boolean>) ?? {};
  const assigneeFilter = typeof viewState.tlAssignee === "string" ? viewState.tlAssignee : "";

  const filtered = React.useMemo(
    () => (assigneeFilter ? rows.filter((r) => String(r[keys.assignee] ?? "") === assigneeFilter) : rows),
    [rows, assigneeFilter, keys.assignee],
  );
  const byId = React.useMemo(() => new Map(filtered.map((r) => [r.id, r])), [filtered]);
  const tree = React.useMemo(() => buildTaskTree(filtered, keys.parent), [filtered, keys.parent]);
  const visible = React.useMemo(() => flattenTree(tree, collapsed), [tree, collapsed]);

  const range = React.useMemo(() => computeRange(filtered, keys, today), [filtered, keys, today]);
  const ppd = PX_PER_DAY[zoom] * (isMobile ? 0.8 : 1);
  const canvasW = Math.ceil(range.days * ppd);
  const spans = React.useMemo(() => {
    const m = new Map<string, TaskSpan>();
    for (const r of filtered) m.set(r.id, taskSpan(r, range, keys));
    return m;
  }, [filtered, range, keys]);
  const edges = React.useMemo(() => depEdges(filtered, keys), [filtered, keys]);
  const critical = React.useMemo(
    () => ((viewConfig.criticalPath as boolean) === false ? new Set<string>() : criticalPath(spans, edges, done, keys.status)),
    [spans, edges, done, keys.status, viewConfig.criticalPath],
  );
  const header = React.useMemo(() => headerCells(range, zoom), [range, zoom]);
  const weekends = React.useMemo(() => (zoom === "day" || zoom === "week" ? weekendOffsets(range) : []), [range, zoom]);
  const todayOff = React.useMemo(() => {
    const s = taskSpan({ id: "_t", [keys.startDate]: isoDay(today), [keys.dueDate]: isoDay(today) } as RecordRow, range, keys);
    return s.start;
  }, [range, keys, today]);

  /* ---- drag to reschedule */
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const dragDays = drag ? Math.round(drag.dx / ppd) : 0;
  const beginDrag = (e: React.PointerEvent, id: string, mode: Drag["mode"]) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, mode, originX: e.clientX, dx: 0 });
  };
  const onDragMove = (e: React.PointerEvent) => {
    if (drag) setDrag({ ...drag, dx: e.clientX - drag.originX });
  };
  const endDrag = () => {
    if (!drag) return setDrag(null);
    const d = Math.round(drag.dx / ppd);
    setDrag(null);
    if (!d) return;
    const row = byId.get(drag.id);
    if (!row) return;
    const start = parseDay(row[keys.startDate]);
    const due = parseDay(row[keys.dueDate]);
    const patch: Record<string, unknown> = {};
    if (drag.mode !== "end" && start) patch[keys.startDate] = isoDay(addDays(start, d));
    if (drag.mode !== "start" && due) patch[keys.dueDate] = isoDay(addDays(due, d));
    // resizing may not invert the bar
    if (drag.mode === "start" && start && due && addDays(start, d) > due) patch[keys.startDate] = isoDay(due);
    if (drag.mode === "end" && start && due && addDays(due, d) < start) patch[keys.dueDate] = isoDay(start);
    if (Object.keys(patch).length) onPatch(drag.id, patch);
  };

  /* ---- quick-add */
  const quickRef = React.useRef<HTMLInputElement>(null);
  const [quickParent, setQuickParent] = React.useState<string | null>(null);
  const submitQuick = async (title: string) => {
    const t = title.trim();
    if (!t) return;
    const body: Record<string, unknown> = {
      [keys.title]: t,
      ...(keys.status && statusField?.options?.length ? { [keys.status]: normalizeOption(statusField.options[0]).value } : {}),
      ...(keys.startDate ? { [keys.startDate]: isoDay(today) } : {}),
      ...(keys.dueDate ? { [keys.dueDate]: isoDay(addDays(today, 3)) } : {}),
      ...(quickParent && keys.parent ? { [keys.parent]: quickParent } : {}),
    };
    if (onCreate) {
      await onCreate(body);
      if (quickRef.current) quickRef.current.value = "";
    } else onCreateDraft?.(body);
  };

  /* ---- keyboard flow on the rail */
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const railKeyDown = (e: React.KeyboardEvent) => {
    const idx = visible.findIndex((n) => n.row.id === focusId);
    const go = (i: number) => {
      const n = visible[Math.max(0, Math.min(visible.length - 1, i))];
      if (n) { setFocusId(n.row.id); (document.querySelector(`[data-tlrow="${n.row.id}"]`) as HTMLElement)?.focus(); }
    };
    if (e.key === "ArrowDown") { e.preventDefault(); go(idx + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(idx - 1); }
    else if (e.key === "ArrowRight" && focusId && collapsed[focusId]) { e.preventDefault(); onViewState({ tlCollapsed: { ...collapsed, [focusId]: false } }); }
    else if (e.key === "ArrowLeft" && focusId && visible[idx]?.children.length && !collapsed[focusId]) { e.preventDefault(); onViewState({ tlCollapsed: { ...collapsed, [focusId]: true } }); }
    else if (e.key === "Enter" && focusId) { e.preventDefault(); onOpen(focusId); }
    else if (e.key === " " && focusId) { e.preventDefault(); onSelectionChange({ ...selection, [focusId]: !selection[focusId] }); }
    else if (e.key.toLowerCase() === "n" && !(e.target as HTMLElement).closest("input")) { e.preventDefault(); setQuickParent(null); quickRef.current?.focus(); }
  };

  const toggleCollapse = (id: string) => onViewState({ tlCollapsed: { ...collapsed, [id]: !collapsed[id] } });

  /* scroll the canvas to today on first paint / zoom change */
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(todayOff * ppd - el.clientWidth / 3, 0);
  }, [ppd, todayOff]);

  const railW = isMobile ? 168 : 330;

  /* geometry for dependency arrows between VISIBLE rows */
  const rowIndex = new Map(visible.map((n, i) => [n.row.id, i]));
  const arrowPaths = edges.flatMap(({ from, to }) => {
    const fi = rowIndex.get(from), ti = rowIndex.get(to);
    const fs = spans.get(from), ts = spans.get(to);
    if (fi === undefined || ti === undefined || !fs || !ts || fs.undated || ts.undated) return [];
    const x1 = fs.end * ppd, y1 = fi * ROW_H + ROW_H / 2;
    const x2 = ts.start * ppd, y2 = ti * ROW_H + ROW_H / 2;
    const gap = 8;
    const path = x2 - x1 >= gap * 2
      ? `M${x1},${y1} L${(x1 + x2) / 2},${y1} L${(x1 + x2) / 2},${y2} L${x2 - 5},${y2}`
      : `M${x1},${y1} L${x1 + gap},${y1} L${x1 + gap},${y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)} L${x2 - gap},${y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)} L${x2 - gap},${y2} L${x2 - 5},${y2}`;
    const late = !done.has(String(fs.row[keys.status] ?? "")) && fs.end > ts.start;
    return [{ key: `${from}-${to}`, path, late }];
  });

  const healthOf = (row: RecordRow) => taskHealth(row, { byId, done, today, keys });

  return (
    <div className="nxTl" data-testid={`timeline-${object.key}`} onPointerMove={onDragMove} onPointerUp={endDrag}>
      <div className="nxTlRail" style={{ width: railW }} onKeyDown={railKeyDown}>
        <div className="nxTlRailHead">
          <span>{object.label}</span>
          <span className="nxCount">{visible.length}</span>
        </div>
        <div className="nxTlRows">
          {visible.map((n) => (
            <RailRow
              key={n.row.id}
              node={n}
              keys={keys}
              object={object}
              users={users}
              readOnly={readOnly}
              compact={isMobile}
              selected={!!selection[n.row.id]}
              focused={focusId === n.row.id}
              collapsedHere={!!collapsed[n.row.id]}
              health={healthOf(n.row)}
              rollup={n.children.length ? subtaskRollup(n, done, keys.status) : null}
              onFocus={() => setFocusId(n.row.id)}
              onToggle={() => toggleCollapse(n.row.id)}
              onOpen={() => onOpen(n.row.id)}
              onSelect={(v) => onSelectionChange({ ...selection, [n.row.id]: v })}
              onPatch={(p) => onPatch(n.row.id, p)}
              onAddChild={onCreate || onCreateDraft ? () => { setQuickParent(n.row.id); quickRef.current?.focus(); } : undefined}
            />
          ))}
          {(onCreate || onCreateDraft) && !readOnly && (
            <div className="nxTlQuick">
              <Plus size={13} />
              <input
                ref={quickRef}
                data-testid="tl-quick-add"
                placeholder={quickParent ? `Subtask of “${String(byId.get(quickParent)?.[keys.title] ?? "")}”… ` : "Quick add — type a title, press Enter"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submitQuick((e.target as HTMLInputElement).value);
                  if (e.key === "Escape") { setQuickParent(null); (e.target as HTMLInputElement).blur(); }
                }}
              />
              {quickParent && (
                <button type="button" className="nxTlQuickClear" onClick={() => setQuickParent(null)}>×</button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="nxTlScroll" ref={scrollRef}>
        <div className="nxTlCanvas" style={{ width: canvasW }}>
          <div className="nxTlHead">
            <div className="nxTlHeadRow">
              {header.top.map((c) => (
                <div key={`${c.label}-${c.start}`} className="nxTlHeadCell" style={{ left: c.start * ppd, width: c.days * ppd }}>{c.label}</div>
              ))}
            </div>
            <div className="nxTlHeadRow nxTlHeadRow--fine">
              {header.bottom.map((c) => (
                <div key={`${c.label}-${c.start}`} className="nxTlHeadCell" style={{ left: c.start * ppd, width: c.days * ppd }}>{c.label}</div>
              ))}
            </div>
          </div>
          <div className="nxTlBody" style={{ height: visible.length * ROW_H }}>
            {weekends.map((w) => (
              <div key={w} className="nxTlWeekend" style={{ left: w * ppd, width: ppd }} />
            ))}
            <div className="nxTlToday" style={{ left: todayOff * ppd + ppd / 2 }} data-testid="tl-today" />
            <svg className="nxTlArrows" width={canvasW} height={visible.length * ROW_H}>
              <defs>
                <marker id="nxTlArrowHead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 Z" fill="currentColor" />
                </marker>
              </defs>
              {arrowPaths.map((a) => (
                <path key={a.key} d={a.path} className={a.late ? "nxTlArrow nxTlArrow--late" : "nxTlArrow"} markerEnd="url(#nxTlArrowHead)" />
              ))}
            </svg>
            {visible.map((n, i) => {
              const s = spans.get(n.row.id)!;
              const health = healthOf(n.row);
              const isDrag = drag?.id === n.row.id;
              const dMove = isDrag && drag!.mode === "move" ? dragDays : 0;
              const dStart = isDrag && drag!.mode === "start" ? dragDays : 0;
              const dEnd = isDrag && drag!.mode === "end" ? dragDays : 0;
              const left = (s.start + dMove + dStart) * ppd;
              const width = Math.max((s.end - s.start - dStart + dEnd) * ppd, ppd * 0.6);
              const meta = optionMeta(statusField, n.row[keys.status]);
              const prog = keys.progress ? Number(n.row[keys.progress] ?? 0) : 0;
              if (s.undated)
                return (
                  <div key={n.row.id} className="nxTlRowLine" style={{ top: i * ROW_H }}>
                    {!readOnly && (
                      <button
                        type="button"
                        className="nxTlSchedule"
                        data-testid={`tl-schedule-${n.row.id}`}
                        onClick={() => onPatch(n.row.id, { [keys.startDate]: isoDay(today), [keys.dueDate]: isoDay(addDays(today, 3)) })}
                      >
                        <CalendarPlus size={12} /> Schedule
                      </button>
                    )}
                  </div>
                );
              return (
                <div key={n.row.id} className="nxTlRowLine" style={{ top: i * ROW_H }}>
                  {s.milestone ? (
                    <div
                      className={`nxTlMilestone nxTlH-${health}`}
                      style={{ left: left + ppd / 2 }}
                      data-testid={`tl-bar-${n.row.id}`}
                      onPointerDown={(e) => beginDrag(e, n.row.id, "move")}
                      onClick={() => !dragDays && onOpen(n.row.id)}
                      title={String(n.row[keys.title] ?? "")}
                    />
                  ) : (
                    <div
                      className={`nxTlBar nxTlH-${health} ${critical.has(n.row.id) ? "nxTlBar--critical" : ""} ${n.children.length ? "nxTlBar--parent" : ""} ${isDrag ? "nxTlBar--drag" : ""}`}
                      style={{ left, width, ["--tl-opt" as string]: meta?.color ? `var(--nx-opt-${meta.color})` : "var(--nx-accent)" }}
                      data-testid={`tl-bar-${n.row.id}`}
                      onPointerDown={(e) => beginDrag(e, n.row.id, "move")}
                      onClick={() => !dragDays && onOpen(n.row.id)}
                      title={String(n.row[keys.title] ?? "")}
                    >
                      {prog > 0 && <div className="nxTlProgress" style={{ width: `${Math.min(prog, 100)}%` }} />}
                      {!readOnly && !s.milestone && (
                        <>
                          <div className="nxTlHandle nxTlHandle--l" onPointerDown={(e) => beginDrag(e, n.row.id, "start")} />
                          <div className="nxTlHandle nxTlHandle--r" onPointerDown={(e) => beginDrag(e, n.row.id, "end")} />
                        </>
                      )}
                      {width > 70 && <span className="nxTlBarLabel">{String(n.row[keys.title] ?? "")}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* one rail row: caret · checkbox · title · rollup · repeat · inline editors */
function RailRow({
  node, keys, object, users, readOnly, compact, selected, focused, collapsedHere, health, rollup,
  onFocus, onToggle, onOpen, onSelect, onPatch, onAddChild,
}: {
  node: TaskNode;
  keys: Keys;
  object: ViewProps["object"];
  users: string[];
  readOnly: boolean;
  compact: boolean;
  selected: boolean;
  focused: boolean;
  collapsedHere: boolean;
  health: string;
  rollup: { done: number; total: number } | null;
  onFocus: () => void;
  onToggle: () => void;
  onOpen: () => void;
  onSelect: (v: boolean) => void;
  onPatch: (p: Record<string, unknown>) => void;
  onAddChild?: () => void;
}) {
  const row = node.row;
  const statusField = object.fields.find((f) => f.key === keys.status);
  const due = row[keys.dueDate];
  const repeat = keys.repeat ? String(row[keys.repeat] ?? "None") : "None";
  return (
    <div
      className={`nxTlRow ${selected ? "nxTlRow--sel" : ""} nxTlRowH-${health}`}
      style={{ height: ROW_H, paddingLeft: 6 + node.depth * (compact ? 10 : 16) }}
      data-tlrow={row.id}
      data-testid={`tl-row-${row.id}`}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={onFocus}
      onDoubleClick={onOpen}
    >
      <input
        type="checkbox"
        className="nxTlCheck"
        checked={selected}
        aria-label={`Select ${String(row[keys.title] ?? "")}`}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onSelect(e.target.checked)}
      />
      {node.children.length > 0 ? (
        <button type="button" className="nxTlCaret" data-testid={`tl-caret-${row.id}`} aria-label={collapsedHere ? "Expand" : "Collapse"} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {collapsedHere ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      ) : (
        <span className="nxTlCaret nxTlCaret--leaf" />
      )}
      <button type="button" className="nxTlTitle" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        {String(row[keys.title] ?? "") || "—"}
      </button>
      {rollup && <span className="nxTlRollup" data-testid={`tl-rollup-${row.id}`}>{rollup.done}/{rollup.total}</span>}
      {repeat !== "None" && <Repeat size={11} className="nxTlRepeat" aria-label={`Repeats ${repeat}`} />}
      {!compact && (
        <span className="nxTlCells" onClick={(e) => e.stopPropagation()}>
          {statusField && (readOnly ? (
            <OptionChip field={statusField} value={row[keys.status]} />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="nxTlCellBtn" data-testid={`tl-status-${row.id}`}>
                  <OptionChip field={statusField} value={row[keys.status]} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(statusField.options ?? []).map((o) => {
                  const v = normalizeOption(o).value;
                  return <DropdownMenuItem key={v} onClick={() => onPatch({ [keys.status]: v })}>{v}</DropdownMenuItem>;
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          {keys.assignee && (readOnly ? (
            <span className="nxTlAssignee">{String(row[keys.assignee] ?? "") || "·"}</span>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="nxTlCellBtn nxTlAssignee" data-testid={`tl-assignee-${row.id}`}>
                  {String(row[keys.assignee] ?? "") || "Assign"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPatch({ [keys.assignee]: "" })}>Unassigned</DropdownMenuItem>
                {users.map((u) => (
                  <DropdownMenuItem key={u} onClick={() => onPatch({ [keys.assignee]: u })}>{u}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          {keys.dueDate && !readOnly && (
            <input
              type="date"
              className="nxTlDate"
              data-testid={`tl-due-${row.id}`}
              value={typeof due === "string" ? due.slice(0, 10) : ""}
              onChange={(e) => onPatch({ [keys.dueDate]: e.target.value || null })}
              aria-label="Due date"
            />
          )}
          {onAddChild && !readOnly && (
            <button type="button" className="nxTlCellBtn nxTlAddSub" data-testid={`tl-addsub-${row.id}`} title="Add subtask" onClick={onAddChild}>
              <Plus size={12} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}
