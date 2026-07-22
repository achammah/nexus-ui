import * as React from "react";
import { addDays } from "date-fns";
import {
  ChevronLeft, ChevronRight, CircleCheck, Clock, Flame, GripVertical, Pause,
  Play, Plus, Sparkles, X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { RecordRow } from "../../types";
import { activeFields, OptionChip } from "../../options";
import { doneStatusValues, isoDay, parseDay, TASK_KEYS, taskHealth } from "../../tasks";
import {
  dayLoad, focusSuggestions, formatClock, formatDuration, isPlannedFor, isTracking,
  logTimePatch, planForDayPatch, plannedRows, timeBudget, toggleTimerPatches,
  sessionSeconds, trackedSecondsOn, trackingRow, TIME_KEYS, unplanPatch,
} from "../../timeTracking";
import type { ViewProps } from "../types";
import "./focus.css";

/* Focus (Today) view — the DAY surface, deliberately not another backlog list:
   the left pane is what you committed to today (ordered, timer-bearing, with a
   live day total); the right pane is where you PULL work in from — ranked
   suggestions (overdue / due soon) plus the rest of the backlog.

   Two rules give the surface its meaning: planning is EXPLICIT (a due date never
   drafts itself into your day — you pull it in), and exactly ONE timer runs at a
   time (starting one stops the other, in a single coherent patch pass).

   State keys in the bag: `focusDate` (the planned day — a stepper, so tomorrow
   can be planned tonight) · `focusUser` (the "my tasks" scope) · `focusPane`
   (mobile's today|add switch). */

type Keys = {
  title: string; status: string; assignee: string; priority: string; labels: string;
  dueDate: string; estimate: string; entries: string; spent: string;
  plannedFor: string; focusOrder: string; blockedBy: string;
};

export function resolveKeys(object: ViewProps["object"], cfg: Record<string, unknown>): Keys {
  const fields = activeFields(object.fields);
  const has = (k: unknown) => typeof k === "string" && fields.some((f) => f.key === k);
  const firstOf = (...types: string[]) => fields.find((f) => types.includes(f.type))?.key ?? "";
  const def = (k: string, alt: string) => (fields.some((f) => f.key === k) ? k : alt);
  const pick = (cfgKey: string, fallback: string) => (has(cfg[cfgKey]) ? (cfg[cfgKey] as string) : fallback);
  const dates = fields.filter((f) => f.type === "date" || f.type === "dateTime").map((f) => f.key);
  return {
    title: pick("titleField", (fields.find((f) => f.primary) ?? fields[0])?.key ?? "title"),
    status: pick("statusField", def(TASK_KEYS.status, object.stageField ?? firstOf("select"))),
    assignee: pick("assigneeField", def(TASK_KEYS.assignee, firstOf("user"))),
    priority: def(TASK_KEYS.priority, ""),
    labels: def(TASK_KEYS.labels, ""),
    dueDate: pick("dueDateField", def(TASK_KEYS.dueDate, dates[1] ?? dates[0] ?? "")),
    estimate: pick("estimateField", def(TASK_KEYS.estimate, "")),
    entries: pick("timeEntriesField", def(TIME_KEYS.entries, "")),
    spent: def(TIME_KEYS.spent, ""),
    plannedFor: pick("plannedForField", def(TIME_KEYS.plannedFor, "")),
    focusOrder: pick("focusOrderField", def(TIME_KEYS.focusOrder, "")),
    blockedBy: def(TASK_KEYS.blockedBy, ""),
  };
}

/* live clock: re-render every second, but ONLY while something is running. The
   returned counter is a memo DEPENDENCY — derived day totals must recompute on
   the tick, not just re-render (else the header freezes while the row ticks). */
function useTick(active: boolean): number {
  const [tick, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(force, 1000);
    return () => clearInterval(t);
  }, [active]);
  return tick;
}

export default function FocusView(props: ViewProps) {
  const { object, rows, users, readOnly, viewConfig, viewState, onViewState, onOpen, onPatch, onCreate } = props;
  const isMobile = useIsMobile();
  const keys = React.useMemo(() => resolveKeys(object, viewConfig), [object, viewConfig]);

  const statusField = object.fields.find((f) => f.key === keys.status);
  const done = React.useMemo(
    () => doneStatusValues(statusField, String(viewConfig.doneStatuses ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    [statusField, viewConfig.doneStatuses],
  );
  const doneValue = React.useMemo(() => [...done][0] ?? "Done", [done]);
  /* the status a task takes when it is created into (or re-opened in) the day.
     Config wins — the first non-done option is a fallback, and on a workflow that
     opens with a holding state ("Backlog") that fallback is the wrong commitment,
     which is exactly why `newTaskStatus` is configurable. */
  const openValue = React.useMemo(() => {
    const cfgV = typeof viewConfig.newTaskStatus === "string" ? viewConfig.newTaskStatus : "";
    if (cfgV) return cfgV;
    return (statusField?.options ?? []).map((o) => (typeof o === "string" ? o : o.value)).find((v) => !done.has(v)) ?? "Todo";
  }, [statusField, done, viewConfig.newTaskStatus]);

  /* the planned day — a stepper so tonight can plan tomorrow */
  const day = React.useMemo(() => {
    const v = typeof viewState.focusDate === "string" ? parseDay(viewState.focusDate) : null;
    return v ?? new Date();
  }, [viewState.focusDate]);
  const isToday = isoDay(day) === isoDay(new Date());
  const stepDay = (n: number) => onViewState({ focusDate: isoDay(addDays(day, n)) });

  /* "my tasks" scope */
  const scope = typeof viewState.focusUser === "string" ? viewState.focusUser : "";
  const scoped = React.useMemo(
    () => (scope && keys.assignee ? rows.filter((r) => String(r[keys.assignee] ?? "") === scope) : rows),
    [rows, scope, keys.assignee],
  );

  const running = trackingRow(rows, keys.entries);
  const tick = useTick(!!running);
  const now = new Date();

  const planned = React.useMemo(
    () => plannedRows(scoped, day, { plannedFor: keys.plannedFor, focusOrder: keys.focusOrder }),
    [scoped, day, keys.plannedFor, keys.focusOrder],
  );
  const load = React.useMemo(
    () => dayLoad(scoped, day, { done, statusKey: keys.status, now, keys: { plannedFor: keys.plannedFor, focusOrder: keys.focusOrder, entries: keys.entries, estimate: keys.estimate } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, day, done, keys, running, tick],
  );
  const suggestions = React.useMemo(
    () => focusSuggestions(scoped, day, { done, statusKey: keys.status, dueKey: keys.dueDate, keys: { plannedFor: keys.plannedFor } }),
    [scoped, day, done, keys],
  );
  const backlog = React.useMemo(() => {
    const sugg = new Set(suggestions.map((r) => r.id));
    return scoped.filter(
      (r) => !isPlannedFor(r, day, { plannedFor: keys.plannedFor }) && !sugg.has(r.id) && !done.has(String(r[keys.status] ?? "")),
    );
  }, [scoped, suggestions, day, done, keys]);

  /* ---- actions */
  const applyPatches = (ps: { id: string; patch: Record<string, unknown> }[]) => ps.forEach((p) => onPatch(p.id, p.patch));
  const toggleTimer = (id: string) =>
    applyPatches(toggleTimerPatches(rows, id, new Date(), { entries: keys.entries, spent: keys.spent }));
  const pull = (id: string) => onPatch(id, planForDayPatch(day, planned.length, { plannedFor: keys.plannedFor, focusOrder: keys.focusOrder }));
  const drop = (id: string) => onPatch(id, unplanPatch({ plannedFor: keys.plannedFor, focusOrder: keys.focusOrder }));
  const complete = (row: RecordRow) => {
    const isDone = done.has(String(row[keys.status] ?? ""));
    onPatch(row.id, { [keys.status]: isDone ? openValue : doneValue });
  };
  const move = (id: string, dir: -1 | 1) => {
    const idx = planned.findIndex((r) => r.id === id);
    const to = idx + dir;
    if (idx < 0 || to < 0 || to >= planned.length) return;
    const next = [...planned];
    const [m] = next.splice(idx, 1);
    next.splice(to, 0, m);
    next.forEach((r, i) => onPatch(r.id, { [keys.focusOrder]: i }));
  };

  /* ---- quick add: a title becomes a task ALREADY planned for the day */
  const [draft, setDraft] = React.useState("");
  const quickAdd = async () => {
    const title = draft.trim();
    if (!title || !onCreate) return;
    setDraft("");
    await onCreate({
      [keys.title]: title,
      [keys.status]: openValue,
      ...(scope && keys.assignee ? { [keys.assignee]: scope } : {}),
      ...planForDayPatch(day, planned.length, { plannedFor: keys.plannedFor, focusOrder: keys.focusOrder }),
    });
  };

  /* ---- keyboard: j/k move · t timer · x complete · [ ] reorder · Backspace unplan */
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const ids = planned.map((r) => r.id);
    const i = focusId ? ids.indexOf(focusId) : -1;
    const focusAt = (n: number) => {
      const id = ids[Math.max(0, Math.min(n, ids.length - 1))];
      if (!id) return;
      setFocusId(id);
      (document.querySelector(`[data-focusrow="${id}"]`) as HTMLElement | null)?.focus();
    };
    if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); focusAt(i < 0 ? 0 : i - 1); }
    else if (!focusId || readOnly) return;
    else if (e.key === "t") { e.preventDefault(); toggleTimer(focusId); }
    else if (e.key === "x") { e.preventDefault(); const r = planned.find((p) => p.id === focusId); if (r) complete(r); }
    else if (e.key === "]") { e.preventDefault(); move(focusId, 1); }
    else if (e.key === "[") { e.preventDefault(); move(focusId, -1); }
    else if (e.key === "Backspace") { e.preventDefault(); drop(focusId); }
    else if (e.key === "Enter") { e.preventDefault(); onOpen(focusId); }
  };

  /* ---- drag to reorder within the day */
  const [dragId, setDragId] = React.useState<string | null>(null);
  const onDropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return setDragId(null);
    const next = planned.filter((r) => r.id !== dragId);
    const at = next.findIndex((r) => r.id === targetId);
    const moved = planned.find((r) => r.id === dragId);
    if (moved) next.splice(at < 0 ? next.length : at, 0, moved);
    next.forEach((r, i) => onPatch(r.id, { [keys.focusOrder]: i }));
    setDragId(null);
  };

  const pane = viewState.focusPane === "add" ? "add" : "today";
  const showToday = !isMobile || pane === "today";
  const showAdd = !isMobile || pane === "add";

  const dayLabel = isToday
    ? "Today"
    : day.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="nxFocus" data-testid={`focus-${object.key}`} onKeyDown={onKeyDown}>
      {/* running banner — the one piece of state that must be visible from anywhere */}
      {running && (
        <div className="nxFocusRunning" data-testid="focus-running">
          <span className="nxFocusRunDot" />
          <Flame size={13} />
          <strong>{String(running[keys.title] ?? "")}</strong>
          {/* the banner reads the CURRENT stretch; the row keeps the task total */}
          <span className="nxFocusClock" data-testid="focus-running-clock">
            {formatClock(sessionSeconds(running, now, keys.entries))}
          </span>
          <button type="button" className="nxFocusStop" data-testid="focus-running-stop" onClick={() => toggleTimer(running.id)}>
            <Pause size={12} /> Stop
          </button>
        </div>
      )}

      <div className="nxFocusPanes">
        {showToday && (
          <section className="nxFocusToday" aria-label="Today">
            <header className="nxFocusHead">
              <div className="nxFocusDay">
                <button type="button" className="nxFocusStep" data-testid="focus-prev-day" aria-label="Previous day" onClick={() => stepDay(-1)}>
                  <ChevronLeft size={14} />
                </button>
                <h3 data-testid="focus-day-label">{dayLabel}</h3>
                <button type="button" className="nxFocusStep" data-testid="focus-next-day" aria-label="Next day" onClick={() => stepDay(1)}>
                  <ChevronRight size={14} />
                </button>
                {!isToday && (
                  <button type="button" className="nxFocusToday-btn" data-testid="focus-jump-today" onClick={() => onViewState({ focusDate: isoDay(new Date()) })}>
                    Today
                  </button>
                )}
              </div>
              <div className="nxFocusStats" data-testid="focus-stats">
                <span title="Planned tasks completed"><CircleCheck size={12} /> {load.done}/{load.planned}</span>
                <span title="Time tracked today"><Clock size={12} /> {formatDuration(load.trackedSeconds)}</span>
                {load.estimateSeconds > 0 && (
                  <span className="nxFocusEst" title="Estimated for the day">of ~{formatDuration(load.estimateSeconds)} planned</span>
                )}
              </div>
              {/* day load meter — tracked against what the day promised */}
              {load.estimateSeconds > 0 && (
                <div className="nxFocusLoad" role="img" aria-label={`${formatDuration(load.trackedSeconds)} tracked of ${formatDuration(load.estimateSeconds)} planned`}>
                  <span style={{ width: `${Math.min(100, (load.trackedSeconds / load.estimateSeconds) * 100)}%` }} />
                </div>
              )}
            </header>

            {onCreate && !readOnly && (
              <div className="nxFocusAdd">
                <Plus size={13} />
                <input
                  className="nxFocusAddInput"
                  data-testid="focus-quick-add"
                  placeholder={`Add a task to ${isToday ? "today" : dayLabel.toLowerCase()}…`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void quickAdd(); if (e.key === "Escape") setDraft(""); }}
                />
              </div>
            )}

            <ul className="nxFocusList" data-testid="focus-list">
              {planned.map((row) => (
                <FocusRow
                  key={row.id}
                  row={row}
                  keys={keys}
                  object={object}
                  users={users}
                  readOnly={readOnly}
                  now={now}
                  day={day}
                  done={done}
                  focused={focusId === row.id}
                  dragging={dragId === row.id}
                  onFocus={() => setFocusId(row.id)}
                  onOpen={() => onOpen(row.id)}
                  onToggleTimer={() => toggleTimer(row.id)}
                  onComplete={() => complete(row)}
                  onDrop={() => drop(row.id)}
                  onPatch={(p) => onPatch(row.id, p)}
                  onDragStart={() => setDragId(row.id)}
                  onDragOver={onDropOn}
                />
              ))}
              {planned.length === 0 && (
                <li className="nxFocusEmpty" data-testid="focus-empty">
                  <Sparkles size={16} />
                  <p><strong>Nothing planned {isToday ? "for today" : "for this day"}.</strong></p>
                  <p>Pull work in from the right, or type a title above. A day you planned beats a backlog you scrolled.</p>
                </li>
              )}
            </ul>
            <p className="nxFocusHint">
              <kbd>j</kbd><kbd>k</kbd> move · <kbd>t</kbd> timer · <kbd>x</kbd> done · <kbd>[</kbd><kbd>]</kbd> reorder · <kbd>⌫</kbd> remove
            </p>
          </section>
        )}

        {showAdd && (
          <aside className="nxFocusPick" aria-label="Add to the day">
            <header className="nxFocusPickHead">
              <h4>Add to {isToday ? "today" : "the day"}</h4>
              {keys.assignee && users.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="nxFocusScope" data-testid="focus-scope">
                      {scope || "Everyone"}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onViewState({ focusUser: "" })}>Everyone</DropdownMenuItem>
                    {users.map((u) => (
                      <DropdownMenuItem key={u} data-testid={`focus-scope-${u}`} onClick={() => onViewState({ focusUser: u })}>
                        {u}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </header>

            {suggestions.length > 0 && (
              <>
                <p className="nxFocusPickLabel">Due or overdue</p>
                <ul className="nxFocusPickList" data-testid="focus-suggestions">
                  {suggestions.map((r) => (
                    <PickRow key={r.id} row={r} keys={keys} object={object} now={now} done={done} onAdd={() => pull(r.id)} onOpen={() => onOpen(r.id)} readOnly={readOnly} />
                  ))}
                </ul>
              </>
            )}

            <p className="nxFocusPickLabel">Backlog</p>
            <ul className="nxFocusPickList" data-testid="focus-backlog">
              {backlog.slice(0, 40).map((r) => (
                <PickRow key={r.id} row={r} keys={keys} object={object} now={now} done={done} onAdd={() => pull(r.id)} onOpen={() => onOpen(r.id)} readOnly={readOnly} />
              ))}
              {backlog.length === 0 && <li className="nxFocusPickEmpty">Backlog is clear.</li>}
            </ul>
          </aside>
        )}
      </div>

      {isMobile && (
        <div className="nxFocusTabs" role="group" aria-label="Focus pane">
          <button type="button" className="nxSegBtn" data-active={pane === "today"} data-testid="focus-pane-today" onClick={() => onViewState({ focusPane: "today" })}>
            {dayLabel} ({load.planned})
          </button>
          <button type="button" className="nxSegBtn" data-active={pane === "add"} data-testid="focus-pane-add" onClick={() => onViewState({ focusPane: "add" })}>
            Add ({suggestions.length + backlog.length})
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- rows */

function FocusRow({
  row, keys, object, users, readOnly, now, day, done, focused, dragging,
  onFocus, onOpen, onToggleTimer, onComplete, onDrop, onPatch, onDragStart, onDragOver,
}: {
  row: RecordRow;
  keys: Keys;
  object: ViewProps["object"];
  users: string[];
  readOnly: boolean;
  now: Date;
  day: Date;
  done: Set<string>;
  focused: boolean;
  dragging: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onToggleTimer: () => void;
  onComplete: () => void;
  onDrop: () => void;
  onPatch: (p: Record<string, unknown>) => void;
  onDragStart: () => void;
  onDragOver: (id: string) => void;
}) {
  const statusField = object.fields.find((f) => f.key === keys.status);
  const priorityField = object.fields.find((f) => f.key === keys.priority);
  const isDone = done.has(String(row[keys.status] ?? ""));
  const tracking = isTracking(row, keys.entries);
  const budget = timeBudget(row, now, { entries: keys.entries, estimate: keys.estimate });
  const todaySec = trackedSecondsOn(row, day, now, keys.entries);
  const health = taskHealth(row, { byId: new Map(), done, today: now, keys: { status: keys.status, dueDate: keys.dueDate, blockedBy: keys.blockedBy } });

  return (
    <li
      className={`nxFocusItem ${isDone ? "nxFocusItem--done" : ""} ${tracking ? "nxFocusItem--live" : ""} ${dragging ? "nxFocusItem--drag" : ""}`}
      data-focusrow={row.id}
      data-testid={`focus-row-${row.id}`}
      data-health={health}
      tabIndex={focused ? 0 : -1}
      onFocus={onFocus}
      onClick={onFocus}
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDragOver(row.id)}
    >
      {!readOnly && <GripVertical size={13} className="nxFocusGrip" aria-hidden />}

      <button
        type="button"
        className="nxFocusCheck"
        role="checkbox"
        aria-checked={isDone}
        aria-label={isDone ? "Mark not done" : "Mark done"}
        data-testid={`focus-check-${row.id}`}
        disabled={readOnly}
        onClick={(e) => { e.stopPropagation(); onComplete(); }}
      >
        {isDone ? <CircleCheck size={16} /> : <span className="nxFocusCheckDot" />}
      </button>

      <div className="nxFocusMain">
        <button type="button" className="nxFocusTitle" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          {String(row[keys.title] ?? "") || "—"}
        </button>
        <div className="nxFocusMeta">
          {statusField && !readOnly ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="nxFocusChipBtn" data-testid={`focus-status-${row.id}`} onClick={(e) => e.stopPropagation()}>
                  <OptionChip field={statusField} value={row[keys.status]} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(statusField.options ?? []).map((o) => {
                  const v = typeof o === "string" ? o : o.value;
                  return <DropdownMenuItem key={v} onClick={() => onPatch({ [keys.status]: v })}>{v}</DropdownMenuItem>;
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : statusField ? <OptionChip field={statusField} value={row[keys.status]} /> : null}

          {priorityField && <OptionChip field={priorityField} value={row[keys.priority]} />}

          {keys.dueDate && Boolean(row[keys.dueDate]) && (
            <span className={`nxFocusDue ${health === "overdue" ? "nxFocusDue--late" : ""}`} data-testid={`focus-due-${row.id}`}>
              {String(row[keys.dueDate]).slice(5)}
            </span>
          )}

          {keys.assignee && users.length > 0 && !readOnly && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="nxFocusChipBtn nxFocusWho" data-testid={`focus-assignee-${row.id}`} onClick={(e) => e.stopPropagation()}>
                  {String(row[keys.assignee] ?? "") || "Assign"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onPatch({ [keys.assignee]: "" })}>Unassigned</DropdownMenuItem>
                {users.map((u) => (
                  <DropdownMenuItem key={u} onClick={() => onPatch({ [keys.assignee]: u })}>{u}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {todaySec > 0 && (
            <span className="nxFocusTodaySpent" title="Tracked on this day">{formatDuration(todaySec)} today</span>
          )}
        </div>

        {/* spent vs estimate — the honest meter: over budget turns warning-toned */}
        {budget.hasEstimate && (
          <div className="nxFocusBudget" data-testid={`focus-budget-${row.id}`} data-over={budget.over}>
            <div className="nxFocusBudgetBar"><span style={{ width: `${budget.ratio * 100}%` }} /></div>
            <span className="nxFocusBudgetText">
              {formatDuration(budget.spentSeconds)} / {formatDuration(budget.estimateSeconds)}
              {budget.over ? " · over" : ""}
            </span>
          </div>
        )}
      </div>

      <div className="nxFocusActions" onClick={(e) => e.stopPropagation()}>
        <span className="nxFocusSpent" data-testid={`focus-spent-${row.id}`}>
          {tracking ? formatClock(budget.spentSeconds) : budget.spentSeconds > 0 ? formatDuration(budget.spentSeconds) : "—"}
        </span>
        {!readOnly && (
          <>
            <button
              type="button"
              className="nxFocusTimer"
              data-live={tracking}
              data-testid={`focus-timer-${row.id}`}
              aria-label={tracking ? "Stop timer" : "Start timer"}
              onClick={onToggleTimer}
            >
              {tracking ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="nxFocusMore" data-testid={`focus-more-${row.id}`} aria-label="More">···</button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onPatch(logTimePatch(row, 15 * 60, new Date(), { entries: keys.entries, spent: keys.spent }))}>
                  Log 15m
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPatch(logTimePatch(row, 30 * 60, new Date(), { entries: keys.entries, spent: keys.spent }))}>
                  Log 30m
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPatch(logTimePatch(row, 3600, new Date(), { entries: keys.entries, spent: keys.spent }))}>
                  Log 1h
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDrop}>Remove from the day</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="button" className="nxFocusRemove" data-testid={`focus-remove-${row.id}`} aria-label="Remove from the day" onClick={onDrop}>
              <X size={13} />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function PickRow({
  row, keys, object, now, done, onAdd, onOpen, readOnly,
}: {
  row: RecordRow;
  keys: Keys;
  object: ViewProps["object"];
  now: Date;
  done: Set<string>;
  onAdd: () => void;
  onOpen: () => void;
  readOnly: boolean;
}) {
  const priorityField = object.fields.find((f) => f.key === keys.priority);
  const health = taskHealth(row, { byId: new Map(), done, today: now, keys: { status: keys.status, dueDate: keys.dueDate, blockedBy: keys.blockedBy } });
  return (
    <li className="nxFocusPickItem" data-testid={`focus-pick-${row.id}`} data-health={health}>
      {!readOnly && (
        <button type="button" className="nxFocusPickAdd" data-testid={`focus-pull-${row.id}`} aria-label="Add to the day" onClick={onAdd}>
          <Plus size={13} />
        </button>
      )}
      <button type="button" className="nxFocusPickTitle" onClick={onOpen}>
        {String(row[keys.title] ?? "") || "—"}
      </button>
      {priorityField && <OptionChip field={priorityField} value={row[keys.priority]} />}
      {keys.dueDate && Boolean(row[keys.dueDate]) && (
        <span className={`nxFocusDue ${health === "overdue" ? "nxFocusDue--late" : ""}`}>{String(row[keys.dueDate]).slice(5)}</span>
      )}
    </li>
  );
}
