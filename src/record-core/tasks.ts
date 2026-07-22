import { addDays, addMonths, addWeeks, formatISO, parseISO } from "date-fns";
import type { FieldDef, ObjectConfig, RecordRow, SelectOption } from "./types";
import { normalizeOption } from "./types";

/* Task model — pure helpers for task-shaped objects (no browser, no vite:
   node-testable). A task object is an ORDINARY ObjectConfig: subtasks are a
   SELF-RELATION field holding the parent id (flat store + derived tree — the
   house flat-adjacency pattern) and dependencies are a MULTIPLE self-relation
   ("blocked by" ids). Nothing here forks the record store; every derivation
   works on plain RecordRow[]. The timeline view (views/timeline/) consumes
   these; boards/tables/calendars work on the same rows unchanged. */

/* ---------------------------------------------------------------- shape */

export interface TaskFieldKeys {
  title: string;
  status: string;
  assignee: string;
  priority: string;
  labels: string;
  startDate: string;
  dueDate: string;
  estimate: string;
  progress: string;
  description: string;
  parent: string;
  blockedBy: string;
  repeat: string;
  /* time tracking (see ./timeTracking.ts) */
  timeEntries: string;
  timeSpent: string;
  /* today/focus planning */
  plannedFor: string;
  focusOrder: string;
}

export const TASK_KEYS: TaskFieldKeys = {
  title: "title",
  status: "status",
  assignee: "assignee",
  priority: "priority",
  labels: "labels",
  startDate: "startDate",
  dueDate: "dueDate",
  estimate: "estimate",
  progress: "progress",
  description: "description",
  parent: "parent",
  blockedBy: "blockedBy",
  repeat: "repeat",
  timeEntries: "timeEntries",
  timeSpent: "timeSpent",
  plannedFor: "plannedFor",
  focusOrder: "focusOrder",
};

export interface TaskConfigOptions {
  /* object key — the self-relations point at it (default "tasks") */
  key?: string;
  label?: string;
  labelOne?: string;
  /* workflow states IN ORDER; the LAST "done"-toned states should carry
     color green/gray so at-risk styling can read them (see doneStatuses) */
  statuses?: SelectOption[];
  /* which status values mean "complete" (default: the ones named like
     done/complete/shipped/cancelled, case-insensitive) */
  doneStatuses?: string[];
  priorities?: SelectOption[];
  labels?: SelectOption[];
  /* extra fields appended after the task fields */
  extraFields?: FieldDef[];
  /* view tabs (default: table · board · timeline · calendar) */
  views?: { type: string; [key: string]: unknown }[];
  defaultView?: string;
}

export const DEFAULT_TASK_STATUSES: SelectOption[] = [
  { value: "Backlog", color: "gray" },
  { value: "Todo", color: "blue" },
  { value: "In progress", color: "yellow" },
  { value: "In review", color: "purple" },
  { value: "Done", color: "green" },
];

export const DEFAULT_TASK_PRIORITIES: SelectOption[] = [
  { value: "Urgent", color: "red" },
  { value: "High", color: "orange" },
  { value: "Medium", color: "blue" },
  { value: "Low", color: "gray" },
];

const DONE_WORDS = /done|complete|shipped|closed|cancel/i;

/* the status values that count as complete for overdue/at-risk/critical-path */
export function doneStatusValues(statusField: FieldDef | undefined, explicit?: string[]): Set<string> {
  if (explicit?.length) return new Set(explicit);
  const vals = (statusField?.options ?? []).map((o) => normalizeOption(o).value);
  return new Set(vals.filter((v) => DONE_WORDS.test(v)));
}

/* Config factory — a ready task tracker ObjectConfig. Everything is overridable;
   the shape (field KEYS) stays TASK_KEYS so the timeline's defaults resolve. */
export function taskObjectConfig(opts: TaskConfigOptions = {}): ObjectConfig {
  const key = opts.key ?? "tasks";
  const statuses = opts.statuses ?? DEFAULT_TASK_STATUSES;
  const fields: FieldDef[] = [
    { key: TASK_KEYS.title, label: "Title", type: "text", primary: true, width: 260 },
    { key: TASK_KEYS.status, label: "Status", type: "select", options: statuses, width: 120 },
    { key: TASK_KEYS.assignee, label: "Assignee", type: "user", width: 130 },
    { key: TASK_KEYS.priority, label: "Priority", type: "select", options: opts.priorities ?? DEFAULT_TASK_PRIORITIES, width: 100 },
    { key: TASK_KEYS.labels, label: "Labels", type: "multiselect", options: opts.labels ?? [], width: 150 },
    { key: TASK_KEYS.startDate, label: "Start", type: "date", width: 110 },
    { key: TASK_KEYS.dueDate, label: "Due", type: "date", width: 110 },
    { key: TASK_KEYS.estimate, label: "Estimate (h)", type: "number", width: 90 },
    { key: TASK_KEYS.timeSpent, label: "Time spent (h)", type: "number", width: 100 },
    { key: TASK_KEYS.progress, label: "Progress %", type: "number", width: 90 },
    { key: TASK_KEYS.repeat, label: "Repeat", type: "select", options: ["None", "Daily", "Weekly", "Biweekly", "Monthly"], width: 100 },
    { key: TASK_KEYS.parent, label: "Parent task", type: "relation", relation: key, inverseLabel: "Subtasks" },
    { key: TASK_KEYS.blockedBy, label: "Blocked by", type: "relation", relation: key, multiple: true, inverseLabel: "Blocks" },
    { key: TASK_KEYS.description, label: "Description", type: "richText" },
    /* time log + day plan — the timer and focus view own these. They stay ACTIVE
       (both surfaces write them) but out of `columns`, so the table hides them by
       default while the Columns menu can still bring "Planned for" in. */
    { key: TASK_KEYS.timeEntries, label: "Time log", type: "json" },
    { key: TASK_KEYS.plannedFor, label: "Planned for", type: "date", width: 110 },
    { key: TASK_KEYS.focusOrder, label: "Focus order", type: "number" },
    ...(opts.extraFields ?? []),
  ];
  return {
    key,
    label: opts.label ?? "Tasks",
    labelOne: opts.labelOne ?? "Task",
    icon: "SquareCheck",
    fields,
    stageField: TASK_KEYS.status,
    columns: [TASK_KEYS.status, TASK_KEYS.assignee, TASK_KEYS.priority, TASK_KEYS.dueDate, TASK_KEYS.labels],
    views: opts.views ?? [
      { type: "focus", newTaskStatus: "Todo" },
      { type: "table" },
      { type: "kanban", groupField: TASK_KEYS.status, cardFields: [TASK_KEYS.assignee, TASK_KEYS.priority, TASK_KEYS.dueDate] },
      { type: "timeline" },
      { type: "calendar", startDateField: TASK_KEYS.startDate, endDateField: TASK_KEYS.dueDate },
    ],
    defaultView: opts.defaultView ?? "focus",
  };
}

/* ------------------------------------------------------- flat → derived */

/* a row's parent id (tolerates raw id, _refs decoration handled by caller) */
export const taskParentId = (row: RecordRow, parentKey = TASK_KEYS.parent): string | null => {
  const v = row[parentKey];
  return typeof v === "string" && v ? v : null;
};

export const taskDependencyIds = (row: RecordRow, depKey = TASK_KEYS.blockedBy): string[] => {
  const v = row[depKey];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" && v ? [v] : [];
};

export interface TaskNode {
  row: RecordRow;
  depth: number;
  children: TaskNode[];
}

/* Flat rows + parent refs → forest. Rows whose parent is missing from the set
   (filtered out, deleted) surface as roots — a filter never hides work. Cycles
   are broken deterministically (the second visit re-roots). Sibling order =
   input order (the host has already sorted). */
export function buildTaskTree(rows: RecordRow[], parentKey = TASK_KEYS.parent): TaskNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const childOf = new Map<string, RecordRow[]>();
  const roots: RecordRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const pid = taskParentId(r, parentKey);
    if (pid && byId.has(pid) && pid !== r.id && !wouldCycle(r.id, pid, byId, parentKey)) {
      const arr = childOf.get(pid) ?? [];
      arr.push(r);
      childOf.set(pid, arr);
    } else roots.push(r);
  }
  const build = (r: RecordRow, depth: number): TaskNode => {
    seen.add(r.id);
    return { row: r, depth, children: (childOf.get(r.id) ?? []).filter((c) => !seen.has(c.id)).map((c) => build(c, depth + 1)) };
  };
  return roots.map((r) => build(r, 0));
}

function wouldCycle(id: string, pid: string, byId: Map<string, RecordRow>, parentKey: string): boolean {
  let cur: string | null = pid;
  const guard = new Set<string>();
  while (cur) {
    if (cur === id) return true;
    if (guard.has(cur)) return true;
    guard.add(cur);
    const p = byId.get(cur);
    cur = p ? taskParentId(p, parentKey) : null;
  }
  return false;
}

/* depth-first flatten, skipping children of collapsed ids */
export function flattenTree(nodes: TaskNode[], collapsed: Record<string, boolean> = {}): TaskNode[] {
  const out: TaskNode[] = [];
  const walk = (n: TaskNode) => {
    out.push(n);
    if (!collapsed[n.row.id]) n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

/* subtask rollup: {done, total} over a node's descendants */
export function subtaskRollup(node: TaskNode, done: Set<string>, statusKey = TASK_KEYS.status): { done: number; total: number } {
  let d = 0, t = 0;
  const walk = (n: TaskNode) => {
    for (const c of n.children) {
      t += 1;
      if (done.has(String(c.row[statusKey] ?? ""))) d += 1;
      walk(c);
    }
  };
  walk(node);
  return { done: d, total: t };
}

/* ------------------------------------------------------------ schedule */

const dayMs = 86_400_000;
export const parseDay = (v: unknown): Date | null => {
  if (typeof v !== "string" || !v) return null;
  const d = parseISO(v.slice(0, 10));
  return isNaN(d.getTime()) ? null : d;
};
export const isoDay = (d: Date): string => formatISO(d, { representation: "date" });
export const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / dayMs);

export type TaskHealth = "done" | "overdue" | "atRisk" | "blocked" | "normal";

/* Health of one task: done → done · past due → overdue · due within `soonDays`
   and not done → atRisk · an INCOMPLETE dependency is itself overdue → blocked. */
export function taskHealth(
  row: RecordRow,
  ctx: { byId: Map<string, RecordRow>; done: Set<string>; today: Date; soonDays?: number; keys?: Partial<TaskFieldKeys> },
): TaskHealth {
  const k = { ...TASK_KEYS, ...ctx.keys };
  if (ctx.done.has(String(row[k.status] ?? ""))) return "done";
  const due = parseDay(row[k.dueDate]);
  if (due && daysBetween(ctx.today, due) < 0) return "overdue";
  for (const dep of taskDependencyIds(row, k.blockedBy)) {
    const d = ctx.byId.get(dep);
    if (!d) continue;
    if (!ctx.done.has(String(d[k.status] ?? ""))) {
      const dDue = parseDay(d[k.dueDate]);
      if (dDue && daysBetween(ctx.today, dDue) < 0) return "blocked";
    }
  }
  if (due && daysBetween(ctx.today, due) <= (ctx.soonDays ?? 2)) return "atRisk";
  return "normal";
}

/* -------------------------------------------------------- recurrence */

export type RepeatRule = "None" | "Daily" | "Weekly" | "Biweekly" | "Monthly";

/* Completing a recurring task: the patch that ROLLS it to its next occurrence
   (start/due shifted by the rule, status reset, progress cleared). The HOST
   applies it (or creates a copy) — this stays a pure derivation; there is no
   background scheduler in the library. Returns null for non-repeating rows. */
export function rollRecurrencePatch(
  row: RecordRow,
  opts: { resetStatus: string; keys?: Partial<TaskFieldKeys> } ,
): Record<string, unknown> | null {
  const k = { ...TASK_KEYS, ...opts.keys };
  const rule = String(row[k.repeat] ?? "None") as RepeatRule;
  if (!rule || rule === "None") return null;
  const shift = (d: Date): Date =>
    rule === "Daily" ? addDays(d, 1) : rule === "Weekly" ? addWeeks(d, 1) : rule === "Biweekly" ? addWeeks(d, 2) : addMonths(d, 1);
  /* the next occurrence is NOT the one you just finished: it leaves the day plan
     (else it sits in Today looking untouched) and starts its own time log */
  const patch: Record<string, unknown> = {
    [k.status]: opts.resetStatus,
    [k.progress]: 0,
    [k.plannedFor]: null,
    [k.focusOrder]: null,
    [k.timeEntries]: [],
    [k.timeSpent]: null,
  };
  const start = parseDay(row[k.startDate]);
  const due = parseDay(row[k.dueDate]);
  if (start) patch[k.startDate] = isoDay(shift(start));
  if (due) patch[k.dueDate] = isoDay(shift(due));
  return patch;
}

/* ------------------------------------------------------------- seed */

/* Demo project: a realistic product-launch plan — 34 tasks, 5 people, subtask
   trees, real cross-team dependencies so a timeline has something to say. */
export function seedTasks(today = new Date()): RecordRow[] {
  const d = (offset: number) => isoDay(addDays(today, offset));
  let n = 0;
  const id = () => `tsk-${String(++n).padStart(2, "0")}`;
  const T = (
    title: string,
    o: Partial<RecordRow> & { start?: number; due?: number } = {},
  ): RecordRow => {
    const { start, due, ...rest } = o;
    return {
      id: id(),
      title,
      status: "Todo",
      assignee: "",
      priority: "Medium",
      labels: [],
      startDate: start !== undefined ? d(start) : null,
      dueDate: due !== undefined ? d(due) : null,
      estimate: null,
      progress: 0,
      repeat: "None",
      parent: null,
      blockedBy: [],
      description: null,
      timeEntries: [],
      timeSpent: null,
      plannedFor: null,
      focusOrder: null,
      ...rest,
    };
  };

  /* a closed time entry `hoursAgo` back, lasting `hours` — realistic sessions so
     the timer UI, the day total and the spent-vs-estimate meters have real data */
  const session = (dayOffset: number, atHour: number, hours: number) => {
    const s = addDays(today, dayOffset);
    s.setHours(atHour, 0, 0, 0);
    const e = new Date(s.getTime() + hours * 3_600_000);
    return { id: `te-${dayOffset}-${atHour}-${Math.round(hours * 10)}`, start: s.toISOString(), end: e.toISOString() };
  };

  const rows: RecordRow[] = [];
  const push = (r: RecordRow) => { rows.push(r); return r.id; };

  // ---- Epic 1: Positioning & site (marketing)
  const e1 = push(T("Launch website refresh", { start: -10, due: 16, status: "In progress", assignee: "Maya", priority: "High", labels: ["marketing"], progress: 45 }));
  const msg = push(T("Messaging & positioning doc", { start: -10, due: -3, status: "Done", assignee: "Maya", labels: ["marketing"], parent: e1, progress: 100 }));
  const wire = push(T("Homepage wireframes", { start: -4, due: 2, status: "In review", assignee: "Leo", labels: ["design"], parent: e1, blockedBy: [msg], progress: 80 }));
  const copy = push(T("Homepage copy", { start: -2, due: 4, status: "In progress", assignee: "Maya", labels: ["marketing"], parent: e1, blockedBy: [msg], progress: 50 }));
  const build = push(T("Build homepage", { start: 3, due: 10, assignee: "Ines", priority: "High", labels: ["web"], parent: e1, blockedBy: [wire, copy], estimate: 24 }));
  const qa1 = push(T("Cross-browser QA pass", { start: 11, due: 13, assignee: "Tom", labels: ["web", "qa"], parent: e1, blockedBy: [build], estimate: 8 }));
  push(T("Publish site", { start: 15, due: 16, assignee: "Ines", priority: "Urgent", labels: ["web"], parent: e1, blockedBy: [qa1] }));

  // ---- Epic 2: Product beta (engineering)
  const e2 = push(T("Private beta program", { start: -14, due: 22, status: "In progress", assignee: "Ravi", priority: "Urgent", labels: ["product"], progress: 35 }));
  const scope = push(T("Beta scope & success metrics", { start: -14, due: -8, status: "Done", assignee: "Ravi", parent: e2, progress: 100 }));
  const flags = push(T("Feature flags & gating", { start: -7, due: -1, status: "Done", assignee: "Ines", labels: ["backend"], parent: e2, blockedBy: [scope], progress: 100 }));
  const onboard = push(T("Beta onboarding flow", { start: -3, due: 5, status: "In progress", assignee: "Leo", priority: "High", labels: ["design", "web"], parent: e2, blockedBy: [flags], progress: 40, estimate: 20 }));
  const invite = push(T("Invite first 50 accounts", { start: 6, due: 8, assignee: "Ravi", priority: "High", parent: e2, blockedBy: [onboard] }));
  const telem = push(T("Usage telemetry dashboard", { start: 2, due: 9, status: "In progress", assignee: "Tom", labels: ["backend", "data"], parent: e2, progress: 30, estimate: 16 }));
  push(T("Weekly beta feedback digest", { start: 9, due: 22, assignee: "Ravi", labels: ["product"], parent: e2, blockedBy: [invite, telem], repeat: "Weekly" }));

  // ---- Epic 3: Pricing & billing
  const e3 = push(T("Pricing & billing", { start: -6, due: 18, status: "In progress", assignee: "Sara", priority: "High", labels: ["product", "billing"], progress: 25 }));
  const bench = push(T("Competitor pricing benchmark", { start: -6, due: -2, status: "Done", assignee: "Sara", parent: e3, progress: 100 }));
  const tiers = push(T("Tier structure proposal", { start: -1, due: 3, status: "In review", assignee: "Sara", parent: e3, blockedBy: [bench], progress: 90 }));
  const stripe = push(T("Stripe products & webhooks", { start: 4, due: 11, assignee: "Ines", priority: "High", labels: ["backend", "billing"], parent: e3, blockedBy: [tiers], estimate: 28 }));
  const paywall = push(T("Upgrade paywall screens", { start: 6, due: 12, assignee: "Leo", labels: ["design"], parent: e3, blockedBy: [tiers], estimate: 12 }));
  push(T("Billing E2E test matrix", { start: 12, due: 15, assignee: "Tom", labels: ["qa", "billing"], parent: e3, blockedBy: [stripe, paywall], estimate: 10 }));
  push(T("Dunning emails", { start: 13, due: 18, assignee: "Maya", labels: ["marketing", "billing"], parent: e3, blockedBy: [stripe] }));

  // ---- Epic 4: Launch day
  const e4 = push(T("Launch day", { start: 16, due: 24, assignee: "Ravi", priority: "Urgent", labels: ["launch"] }));
  const ph = push(T("Product Hunt assets", { start: 8, due: 14, status: "Todo", assignee: "Leo", labels: ["marketing", "design"], parent: e4, estimate: 10 }));
  const press = push(T("Press & partner brief", { start: 10, due: 17, assignee: "Maya", labels: ["marketing"], parent: e4 }));
  const seq = push(T("Announcement email sequence", { start: 12, due: 19, assignee: "Maya", labels: ["marketing"], parent: e4, blockedBy: [press] }));
  push(T("Launch-day runbook", { start: 18, due: 21, assignee: "Ravi", priority: "High", parent: e4, blockedBy: [ph, seq] }));
  push(T("Go live + monitor", { start: 23, due: 24, assignee: "Tom", priority: "Urgent", labels: ["launch"], parent: e4 }));

  // ---- Ongoing / overdue strays (health styling has something to show)
  const bug = push(T("Fix OAuth token refresh bug", { start: -5, due: -1, status: "In progress", assignee: "Ines", priority: "Urgent", labels: ["backend", "bug"], progress: 60, estimate: 6 }));
  push(T("Update security policy page", { start: -8, due: -2, assignee: "Sara", labels: ["legal"] }));
  const triage = push(T("Triage support inbox", { start: 0, due: 1, assignee: "Tom", labels: ["support"], repeat: "Daily", estimate: 1 }));
  push(T("Sprint retro notes", { start: 2, due: 2, assignee: "Ravi", repeat: "Biweekly" }));
  push(T("Blog: beta learnings", { start: 5, due: 12, assignee: "Maya", labels: ["marketing", "content"] }));
  push(T("Accessibility audit", { start: 7, due: 14, assignee: "Leo", labels: ["design", "qa"], estimate: 12 }));
  push(T("Load test checkout path", { start: 14, due: 17, assignee: "Tom", labels: ["backend", "qa"], blockedBy: [stripe] }));

  /* ---- time log + today's plan, so the focus view and the timer open populated
     rather than on an empty state the reviewer has to build by hand */
  const byId = new Map(rows.map((r) => [r.id, r]));
  const track = (id: string, entries: ReturnType<typeof session>[]) => {
    const r = byId.get(id);
    if (!r) return;
    r.timeEntries = entries;
    r.timeSpent = Math.round((entries.reduce((s, e) => s + (Date.parse(e.end) - Date.parse(e.start)), 0) / 3_600_000) * 100) / 100;
  };
  const plan = (id: string, order: number) => {
    const r = byId.get(id);
    if (!r) return;
    r.plannedFor = isoDay(today);
    r.focusOrder = order;
  };

  track(bug, [session(-2, 14, 1.5), session(-1, 9, 2), session(0, 9, 1.25)]);
  track(onboard, [session(-3, 10, 3), session(-1, 14, 2.5), session(0, 11, 0.75)]);
  track(copy, [session(-1, 16, 1.25)]);
  track(telem, [session(-1, 11, 2), session(0, 13, 1)]);
  track(wire, [session(-4, 9, 4), session(-3, 9, 3.5)]);
  track(triage, [session(0, 8, 0.5)]);
  track(msg, [session(-9, 9, 6), session(-8, 10, 5)]);

  plan(bug, 0);
  plan(triage, 1);
  plan(onboard, 2);
  plan(copy, 3);
  plan(telem, 4);

  return rows;
}

export const SEED_TASK_USERS = ["Maya", "Leo", "Ines", "Ravi", "Sara", "Tom"];

export const SEED_TASK_LABELS: SelectOption[] = [
  { value: "marketing", color: "pink" },
  { value: "design", color: "purple" },
  { value: "web", color: "blue" },
  { value: "backend", color: "teal" },
  { value: "product", color: "orange" },
  { value: "billing", color: "yellow" },
  { value: "qa", color: "green" },
  { value: "data", color: "blue" },
  { value: "launch", color: "red" },
  { value: "bug", color: "red" },
  { value: "support", color: "gray" },
  { value: "content", color: "pink" },
  { value: "legal", color: "gray" },
];
