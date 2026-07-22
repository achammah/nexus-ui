# Recipes

Task-shaped recipes for the record-core. Each one is config first: the library ships the
model and the views, the consumer ships an `ObjectConfig` and the store callbacks.

## Ship a task tracker

`taskObjectConfig()` returns a ready task `ObjectConfig` — every part overridable, the field
KEYS held stable (`TASK_KEYS`) so the task-aware views resolve their defaults without config:

```ts
import { taskObjectConfig, seedTasks, SEED_TASK_USERS, SEED_TASK_LABELS } from "@nexus/ui";

const tasks = taskObjectConfig({
  labels: SEED_TASK_LABELS,
  statuses: [
    { value: "Backlog", color: "gray" },
    { value: "Doing", color: "yellow" },
    { value: "Shipped", color: "green" },   // matched as "done" by name
  ],
});
```

The shape it declares: `title` `status` `assignee` `priority` `labels` `startDate` `dueDate`
`estimate` (hours) `timeSpent` `progress` `repeat` `description`, plus four structural fields:

| Field | Type | What it carries |
|---|---|---|
| `parent` | self-relation | **subtasks** — a flat store, the tree is derived |
| `blockedBy` | multiple self-relation | **dependencies** — "is blocked by" ids |
| `timeEntries` | json | the time log (`TimeEntry[]`; a running entry has `end: null`) |
| `plannedFor` + `focusOrder` | date + number | the **day plan** the Today view orders |

Subtasks and dependencies are ordinary relations, so nothing forks the record store: tables,
boards and calendars render the same rows unchanged. The tree is derived on read
(`buildTaskTree` → `flattenTree`), which is why a filtered-out parent never hides its
children — an orphan surfaces as a root rather than disappearing.

Which statuses count as "complete" is derived from their NAMES
(`done|complete|shipped|closed|cancel`) unless you say otherwise — pass `doneStatuses`, or set
`doneStatuses` on a view's config, and the derivation steps aside.

## Add the Timeline (Gantt) view

```ts
views: [{ type: "timeline" }]
```

Bars run start→due on a time axis with the subtask tree in the left rail: dependency arrows,
drag-to-reschedule (whole days; edge handles resize, and a resize may not invert the bar),
day/week/month/quarter zoom, a today marker, weekend shading, overdue / at-risk / blocked
styling, and critical-path emphasis (the longest chain by duration through the incomplete
dependency DAG). A due-only task renders as a milestone diamond; an undated one parks in the
rail with no bar rather than being dropped.

Every config key is optional — defaults resolve from `TASK_KEYS`, then from the object's own
fields — so the view works on a non-task object by naming its fields:

```ts
{ type: "timeline", startDateField: "kickoff", dueDateField: "deadline",
  parentField: "epic", dependenciesField: "waitsOn", defaultZoom: "month",
  criticalPath: false }
```

View-state keys in the bag: `tlZoom` · `tlCollapsed` · `tlAssignee`.

On mobile the rail narrows to titles + carets and the zoom drops to month, so the whole plan
stays legible instead of becoming a horizontal scroll maze.

## Add the Today (focus) view

```ts
views: [{ type: "focus", newTaskStatus: "Todo" }]
```

The day surface, deliberately not another backlog: an ordered day plan with per-task timers on
the left, and the pull-in pane (overdue / due-soon suggestions, then the backlog) on the right.
Two rules give it meaning:

- **Planning is explicit.** A due date never drafts work into your day — it only *suggests*.
  Pulling a task in writes `plannedFor` + `focusOrder`; nothing else moves.
- **One timer runs at a time.** Starting a timer emits the stop patch for whatever was running,
  so the switch lands as one coherent pass rather than two racing writes.

Keyboard: <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>t</kbd> timer · <kbd>x</kbd> done ·
<kbd>[</kbd>/<kbd>]</kbd> reorder · <kbd>⌫</kbd> remove from the day · <kbd>Enter</kbd> open.
Quick-add takes a title and creates the task already planned for the day. The day stepper plans
tomorrow tonight. `focusUser` scopes to one person ("My tasks").

View-state keys: `focusDate` · `focusUser` · `focusPane` (mobile's Today|Add switch).

`newTaskStatus` exists because the first non-done status is the wrong default on a workflow
that opens with a holding state — a task you just committed to today should not land in
"Backlog".

## Track time

The log lives on the row (`timeEntries`), not in a side store, and elapsed time is DERIVED from
it — so a reload, or a closed laptop, neither loses nor double-counts a running stretch. There
is no background ticker.

```ts
import { toggleTimerPatches, timeBudget, formatDuration, logTimePatch } from "@nexus/ui";

// the host applies every returned patch — a switch is two of them
toggleTimerPatches(rows, id).forEach(({ id, patch }) => onPatch(id, patch));

const { spentSeconds, ratio, over } = timeBudget(row);   // vs `estimate`, in hours
logTimePatch(row, 30 * 60);                              // "I forgot to start the timer"
```

`trackedSecondsOn(row, day)` attributes a session to the day it STARTED — the simple rule a
user can predict when a stretch crosses midnight. `dayLoad` rolls the plan up for the header;
`sessionSeconds` is the current stretch (what the running banner reads), distinct from the
task total (what the row reads).

Completing a repeating task rolls it to its next occurrence via `rollRecurrencePatch` — which
also clears the day plan and the time log, because the next occurrence is not the one you just
finished and must not sit in Today looking untouched.

## Wire an issue provider (GitHub, Jira)

`taskSync.ts` is a **seam, not an integration**: it performs no network I/O. You bring the
authenticated call, its pagination and its rate-limit policy; the module owns the two things
you cannot guess — the payload SHAPE and the MAPPING onto a task row.

```ts
import { syncIssues, linkIssues, GITHUB_MAPPING } from "@nexus/ui";

const issues = (await gh.listIssues(...)).map(GITHUB_MAPPING);
const { creates, updates, orphans } = syncIssues(rows, issues, {
  statusMap: { open: "Todo", closed: "Done" },
});
await Promise.all(creates.map(create));
updates.forEach(({ id, patch }) => onPatch(id, patch));
// second pass: provider links reference EXTERNAL ids, which only resolve once rows exist
linkIssues(await reload(), issues).forEach(({ id, patch }) => onPatch(id, patch));
```

The diff is conservative on purpose:

- an **unmapped provider state leaves the local status alone** rather than guessing a column;
- **`localOnly` fields are never overwritten** — by default the day plan and the time log, because
  a provider has no opinion about your day;
- a local row whose `externalId` is absent from the payload is returned as an **orphan**, surfaced
  for the caller to decide, never auto-deleted;
- only CHANGED fields enter a patch, so a sync that finds nothing writes nothing.

`GITHUB_MAPPING` and `JIRA_MAPPING` are written against the documented REST shapes (Jira's
`timeoriginalestimate` is seconds; a GitHub issue has no native due date, so the milestone's
`due_on` is used). Field availability varies with plan, custom fields and expansions — verify
against a real payload from your instance before relying on an optional field.

`mockIssues` is **explicitly labelled demo data** (`MOCK_NOTICE`) so a surface can say so
rather than implying a connected account.

## Saved views and filters

Task views do not filter — the host does, and the views receive rows already searched and
filtered (the `ViewProps` contract). So saved views need no task-specific machinery: persist
`{ filters, search, viewType, viewState }` and re-apply it. Because the view-state bag is
captured too, a saved view restores the zoom you left the timeline on, or the person the Today
view was scoped to.
