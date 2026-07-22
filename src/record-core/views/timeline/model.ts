import { addDays, differenceInCalendarDays, format, startOfMonth, startOfQuarter, startOfWeek } from "date-fns";
import type { RecordRow } from "../../types";
import { parseDay, taskDependencyIds, type TaskFieldKeys, TASK_KEYS } from "../../tasks";

/* Timeline math — pure (no browser, no vite: node-testable). Positions are in
   DAYS from the range origin; the component multiplies by px-per-day. */

export type TimelineZoom = "day" | "week" | "month" | "quarter";

export const ZOOMS: TimelineZoom[] = ["day", "week", "month", "quarter"];
export const ZOOM_LABELS: Record<TimelineZoom, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter" };

/* horizontal density per zoom (px per day) */
export const PX_PER_DAY: Record<TimelineZoom, number> = { day: 44, week: 18, month: 6.5, quarter: 2.6 };

export interface TaskSpan {
  row: RecordRow;
  /* day offsets from range start (end EXCLUSIVE, so width = end - start ≥ 1) */
  start: number;
  end: number;
  /* a due-only task renders as a milestone diamond */
  milestone: boolean;
  /* dates were missing entirely → parked lane (no bar) */
  undated: boolean;
}

export interface TimelineRange {
  origin: Date;
  days: number;
}

/* Range = min(start)−pad … max(due)+pad, clamped around today when empty. */
export function computeRange(rows: RecordRow[], keys: Partial<TaskFieldKeys>, today: Date, padDays = 7): TimelineRange {
  const k = { ...TASK_KEYS, ...keys };
  let min: Date | null = null, max: Date | null = null;
  for (const r of rows) {
    for (const v of [parseDay(r[k.startDate]), parseDay(r[k.dueDate])]) {
      if (!v) continue;
      if (!min || v < min) min = v;
      if (!max || v > max) max = v;
    }
  }
  const lo = addDays(min ?? today, -padDays);
  const hi = addDays(max ?? addDays(today, 21), padDays + 1);
  return { origin: lo, days: Math.max(differenceInCalendarDays(hi, lo), 14) };
}

export function taskSpan(row: RecordRow, range: TimelineRange, keys: Partial<TaskFieldKeys>): TaskSpan {
  const k = { ...TASK_KEYS, ...keys };
  const s = parseDay(row[k.startDate]);
  const d = parseDay(row[k.dueDate]);
  if (!s && !d) return { row, start: 0, end: 1, milestone: false, undated: true };
  const a = s ?? d!;
  const b = d ?? s!;
  const start = differenceInCalendarDays(a, range.origin);
  const end = Math.max(differenceInCalendarDays(b, range.origin) + 1, start + 1);
  return { row, start, end, milestone: !s && !!d, undated: false };
}

/* ------------------------------------------------------------ header */

export interface HeaderCell { label: string; start: number; days: number }

/* two header rows per zoom: coarse (months/quarters) + fine (days/weeks/months) */
export function headerCells(range: TimelineRange, zoom: TimelineZoom): { top: HeaderCell[]; bottom: HeaderCell[] } {
  const top: HeaderCell[] = [];
  const bottom: HeaderCell[] = [];
  const end = addDays(range.origin, range.days);
  const push = (arr: HeaderCell[], from: Date, to: Date, label: string) => {
    const a = Math.max(differenceInCalendarDays(from, range.origin), 0);
    const b = Math.min(differenceInCalendarDays(to, range.origin), range.days);
    if (b > a) arr.push({ label, start: a, days: b - a });
  };
  if (zoom === "day" || zoom === "week") {
    // top: months
    let m = startOfMonth(range.origin);
    while (m < end) { const nxt = startOfMonth(addDays(m, 45)); push(top, m, nxt, format(m, "MMMM yyyy")); m = nxt; }
    if (zoom === "day") {
      for (let i = 0; i < range.days; i++) {
        const d0 = addDays(range.origin, i);
        bottom.push({ label: format(d0, "EEEEE d"), start: i, days: 1 });
      }
    } else {
      let w = startOfWeek(range.origin, { weekStartsOn: 1 });
      while (w < end) { push(bottom, w, addDays(w, 7), format(w, "d MMM")); w = addDays(w, 7); }
    }
  } else {
    // top: quarters · bottom: months
    let q = startOfQuarter(range.origin);
    while (q < end) { const nq = startOfQuarter(addDays(q, 100)); push(top, q, nq, format(q, "QQQ yyyy")); q = nq; }
    let m = startOfMonth(range.origin);
    while (m < end) { const nm = startOfMonth(addDays(m, 45)); push(bottom, m, nm, format(m, zoom === "month" ? "MMM" : "MMM")); m = nm; }
  }
  return { top, bottom };
}

/* weekend day offsets (day/week zooms shade them) */
export function weekendOffsets(range: TimelineRange): number[] {
  const out: number[] = [];
  for (let i = 0; i < range.days; i++) {
    const dow = addDays(range.origin, i).getDay();
    if (dow === 0 || dow === 6) out.push(i);
  }
  return out;
}

/* ------------------------------------------------------ dependencies */

export interface DepEdge { from: string; to: string }

export function depEdges(rows: RecordRow[], keys: Partial<TaskFieldKeys>): DepEdge[] {
  const k = { ...TASK_KEYS, ...keys };
  const ids = new Set(rows.map((r) => r.id));
  const out: DepEdge[] = [];
  for (const r of rows) for (const dep of taskDependencyIds(r, k.blockedBy)) if (ids.has(dep)) out.push({ from: dep, to: r.id });
  return out;
}

/* Critical path — longest chain (by span duration) through the dependency DAG
   over INCOMPLETE tasks; returns the ids on it. Cheap: memoized DFS, cycles cut. */
export function criticalPath(
  spans: Map<string, TaskSpan>,
  edges: DepEdge[],
  done: Set<string>,
  statusKey: string,
): Set<string> {
  const incoming = new Map<string, string[]>(); // to → froms
  for (const e of edges) {
    if (!spans.has(e.from) || !spans.has(e.to)) continue;
    (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)!).push(e.from);
  }
  const isDone = (id: string) => {
    const s = spans.get(id);
    return !s || done.has(String(s.row[statusKey] ?? ""));
  };
  const dur = (id: string) => { const s = spans.get(id)!; return s.end - s.start; };
  const memo = new Map<string, { len: number; prev: string | null }>();
  const visiting = new Set<string>();
  const longest = (id: string): { len: number; prev: string | null } => {
    const hit = memo.get(id);
    if (hit) return hit;
    if (visiting.has(id)) return { len: 0, prev: null }; // cycle guard
    visiting.add(id);
    let best: { len: number; prev: string | null } = { len: dur(id), prev: null };
    for (const p of incoming.get(id) ?? []) {
      if (isDone(p)) continue;
      const r = longest(p);
      if (r.len + dur(id) > best.len) best = { len: r.len + dur(id), prev: p };
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  };
  let endId: string | null = null, endLen = 0;
  for (const id of spans.keys()) {
    if (isDone(id)) continue;
    const r = longest(id);
    if (r.len > endLen) { endLen = r.len; endId = id; }
  }
  const path = new Set<string>();
  while (endId) { path.add(endId); endId = memo.get(endId)?.prev ?? null; }
  return path.size > 1 ? path : new Set();
}
