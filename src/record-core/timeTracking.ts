import type { RecordRow } from "./types";
import { isoDay, parseDay } from "./tasks";

/* Time tracking — pure helpers (no browser, no vite: node-testable). A task's
   tracked time lives ON THE ROW as an ENTRY LOG (a `json` field holding
   TimeEntry[]), not as a bare counter: the log is what makes "2h today" and
   "spent vs estimate" answerable, and a RUNNING entry is simply one with
   `end: null`. There is no parallel store and no background ticker — the UI
   re-renders on a clock and derives elapsed from the log, so a reload (or a
   closed laptop) never loses or double-counts time.

   ONE timer runs at a time across the whole task set: startTimerPatches returns
   the patch for the task being started PLUS the stop patch for whatever was
   running, so the host applies a coherent switch in one pass. */

export interface TimeEntry {
  id: string;
  /* ISO instants; end null → still running */
  start: string;
  end: string | null;
  note?: string;
}

/* the field KEYS this module reads/writes — every helper takes a Partial
   override so an object with a different schema wires without a fork */
export interface TimeFieldKeys {
  entries: string;
  spent: string;
  estimate: string;
  plannedFor: string;
  focusOrder: string;
}

export const TIME_KEYS: TimeFieldKeys = {
  entries: "timeEntries",
  spent: "timeSpent",
  estimate: "estimate",
  plannedFor: "plannedFor",
  focusOrder: "focusOrder",
};

/* ------------------------------------------------------------- reading */

export function taskEntries(row: RecordRow, key: string = TIME_KEYS.entries): TimeEntry[] {
  const v = row[key];
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is TimeEntry =>
      typeof e === "object" && e !== null && typeof (e as TimeEntry).start === "string",
  );
}

export const runningEntry = (entries: TimeEntry[]): TimeEntry | null =>
  entries.find((e) => e.end == null) ?? null;

export const isTracking = (row: RecordRow, key?: string): boolean =>
  runningEntry(taskEntries(row, key)) != null;

/* the running task across a set (there is at most one) */
export const trackingRow = (rows: RecordRow[], key?: string): RecordRow | null =>
  rows.find((r) => isTracking(r, key)) ?? null;

const ms = (s: string): number => {
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
};

/* seconds in one entry (a running entry counts up to `now`) */
export function entrySeconds(e: TimeEntry, now: Date = new Date()): number {
  const a = ms(e.start);
  if (!a) return 0;
  const b = e.end ? ms(e.end) : now.getTime();
  return Math.max(0, Math.round((b - a) / 1000));
}

/* elapsed in the CURRENT running stretch (0 when idle) — what the running
   banner reads: "how long have I been at this", distinct from the task total */
export function sessionSeconds(row: RecordRow, now: Date = new Date(), key?: string): number {
  const e = runningEntry(taskEntries(row, key));
  return e ? entrySeconds(e, now) : 0;
}

/* total tracked seconds on a task */
export function trackedSeconds(row: RecordRow, now: Date = new Date(), key?: string): number {
  return taskEntries(row, key).reduce((sum, e) => sum + entrySeconds(e, now), 0);
}

/* tracked seconds attributable to ONE calendar day — an entry is counted by the
   day it STARTED (the simple, explainable rule; a session crossing midnight
   stays with the day the work began) */
export function trackedSecondsOn(row: RecordRow, day: Date, now: Date = new Date(), key?: string): number {
  const target = isoDay(day);
  return taskEntries(row, key)
    .filter((e) => e.start.slice(0, 10) === target)
    .reduce((sum, e) => sum + entrySeconds(e, now), 0);
}

export const totalTrackedOn = (rows: RecordRow[], day: Date, now: Date = new Date(), key?: string): number =>
  rows.reduce((sum, r) => sum + trackedSecondsOn(r, day, now, key), 0);

/* ------------------------------------------------------------ mutating */

const newId = (): string => `te-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/* close a running entry; null when nothing is running */
export function stopTimerPatch(
  row: RecordRow,
  now: Date = new Date(),
  keys: Partial<TimeFieldKeys> = {},
): Record<string, unknown> | null {
  const k = { ...TIME_KEYS, ...keys };
  const entries = taskEntries(row, k.entries);
  if (!runningEntry(entries)) return null;
  const closed = entries.map((e) => (e.end == null ? { ...e, end: now.toISOString() } : e));
  return { [k.entries]: closed, [k.spent]: secondsToHours(closed.reduce((s, e) => s + entrySeconds(e, now), 0)) };
}

/* Start the timer on `id`, stopping whatever else was running. Returns one patch
   per affected row — the host applies them all (a switch is two patches). */
export function startTimerPatches(
  rows: RecordRow[],
  id: string,
  now: Date = new Date(),
  keys: Partial<TimeFieldKeys> = {},
): { id: string; patch: Record<string, unknown> }[] {
  const k = { ...TIME_KEYS, ...keys };
  const out: { id: string; patch: Record<string, unknown> }[] = [];
  for (const r of rows) {
    if (r.id === id) continue;
    const stop = stopTimerPatch(r, now, keys);
    if (stop) out.push({ id: r.id, patch: stop });
  }
  const target = rows.find((r) => r.id === id);
  if (target && !isTracking(target, k.entries)) {
    const entries = [...taskEntries(target, k.entries), { id: newId(), start: now.toISOString(), end: null }];
    out.push({ id, patch: { [k.entries]: entries } });
  }
  return out;
}

/* toggle: running → stop, idle → start (stopping any other) */
export function toggleTimerPatches(
  rows: RecordRow[],
  id: string,
  now: Date = new Date(),
  keys: Partial<TimeFieldKeys> = {},
): { id: string; patch: Record<string, unknown> }[] {
  const row = rows.find((r) => r.id === id);
  if (!row) return [];
  if (isTracking(row, { ...TIME_KEYS, ...keys }.entries)) {
    const stop = stopTimerPatch(row, now, keys);
    return stop ? [{ id, patch: stop }] : [];
  }
  return startTimerPatches(rows, id, now, keys);
}

/* manual adjustment — log a closed entry of `seconds` ending now (the "I forgot
   to start the timer" path every real tracker needs) */
export function logTimePatch(
  row: RecordRow,
  seconds: number,
  now: Date = new Date(),
  keys: Partial<TimeFieldKeys> = {},
): Record<string, unknown> {
  const k = { ...TIME_KEYS, ...keys };
  const start = new Date(now.getTime() - Math.max(0, seconds) * 1000).toISOString();
  const entries = [...taskEntries(row, k.entries), { id: newId(), start, end: now.toISOString(), note: "manual" }];
  return { [k.entries]: entries, [k.spent]: secondsToHours(entries.reduce((s, e) => s + entrySeconds(e, now), 0)) };
}

/* ------------------------------------------------------------- format */

export const secondsToHours = (sec: number): number => Math.round((sec / 3600) * 100) / 100;

/* "1h 24m" · "24m" · "48s" — compact, never "0h 0m" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* clock face for a RUNNING timer — "0:07:12" (seconds tick, so it reads live) */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* spent vs estimate — ratio > 1 means over budget (the bar turns warning-toned) */
export interface TimeBudget {
  spentSeconds: number;
  estimateSeconds: number;
  /* 0..1 clamped for the meter; `over` carries the honest overflow */
  ratio: number;
  over: boolean;
  hasEstimate: boolean;
}

export function timeBudget(
  row: RecordRow,
  now: Date = new Date(),
  keys: Partial<TimeFieldKeys> = {},
): TimeBudget {
  const k = { ...TIME_KEYS, ...keys };
  const spentSeconds = trackedSeconds(row, now, k.entries);
  const est = row[k.estimate];
  const estimateSeconds = typeof est === "number" && est > 0 ? est * 3600 : 0;
  const hasEstimate = estimateSeconds > 0;
  const raw = hasEstimate ? spentSeconds / estimateSeconds : 0;
  return { spentSeconds, estimateSeconds, ratio: Math.min(raw, 1), over: hasEstimate && raw > 1, hasEstimate };
}

/* ------------------------------------------------------ today / focus */

/* Is this task planned for `day`? A task is IN the day's plan when it was
   explicitly pulled in (plannedFor === day). Pulling is deliberate — a due date
   alone never drafts work into today; the focus view offers those as SUGGESTIONS
   the user accepts. */
export function isPlannedFor(row: RecordRow, day: Date, keys: Partial<TimeFieldKeys> = {}): boolean {
  const k = { ...TIME_KEYS, ...keys };
  const v = parseDay(row[k.plannedFor]);
  return v != null && isoDay(v) === isoDay(day);
}

export const planForDayPatch = (day: Date, order: number, keys: Partial<TimeFieldKeys> = {}): Record<string, unknown> => {
  const k = { ...TIME_KEYS, ...keys };
  return { [k.plannedFor]: isoDay(day), [k.focusOrder]: order };
};

export const unplanPatch = (keys: Partial<TimeFieldKeys> = {}): Record<string, unknown> => {
  const k = { ...TIME_KEYS, ...keys };
  return { [k.plannedFor]: null, [k.focusOrder]: null };
};

/* the day's plan, in focusOrder */
export function plannedRows(rows: RecordRow[], day: Date, keys: Partial<TimeFieldKeys> = {}): RecordRow[] {
  const k = { ...TIME_KEYS, ...keys };
  return rows
    .filter((r) => isPlannedFor(r, day, keys))
    .sort((a, b) => num(a[k.focusOrder]) - num(b[k.focusOrder]));
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number.MAX_SAFE_INTEGER);

/* Suggestions to pull in: not planned, not done, and either overdue or due
   within `horizonDays`. Ranked overdue-first, then by due date. */
export function focusSuggestions(
  rows: RecordRow[],
  day: Date,
  opts: { done: Set<string>; statusKey: string; dueKey: string; horizonDays?: number; limit?: number; keys?: Partial<TimeFieldKeys> },
): RecordRow[] {
  const horizon = opts.horizonDays ?? 3;
  const today = new Date(isoDay(day));
  const scored: { row: RecordRow; due: Date | null; days: number }[] = [];
  for (const r of rows) {
    if (isPlannedFor(r, day, opts.keys)) continue;
    if (opts.done.has(String(r[opts.statusKey] ?? ""))) continue;
    const due = parseDay(r[opts.dueKey]);
    if (!due) continue;
    const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
    if (days > horizon) continue;
    scored.push({ row: r, due, days });
  }
  scored.sort((a, b) => a.days - b.days);
  return scored.slice(0, opts.limit ?? 8).map((s) => s.row);
}

/* the day's committed vs tracked load, for the focus header */
export interface DayLoad {
  planned: number;
  done: number;
  estimateSeconds: number;
  trackedSeconds: number;
}

export function dayLoad(
  rows: RecordRow[],
  day: Date,
  opts: { done: Set<string>; statusKey: string; now?: Date; keys?: Partial<TimeFieldKeys> },
): DayLoad {
  const k = { ...TIME_KEYS, ...opts.keys };
  const now = opts.now ?? new Date();
  const planned = plannedRows(rows, day, opts.keys);
  return {
    planned: planned.length,
    done: planned.filter((r) => opts.done.has(String(r[opts.statusKey] ?? ""))).length,
    estimateSeconds: planned.reduce((s, r) => s + (typeof r[k.estimate] === "number" ? (r[k.estimate] as number) * 3600 : 0), 0),
    trackedSeconds: planned.reduce((s, r) => s + trackedSecondsOn(r, day, now, k.entries), 0),
  };
}
