# Self-review — tasks lane (task model · Timeline view · Today/focus view)

Reference bar: Linear (keyboard, density, restraint) · Asana/Height (timeline, dependencies) ·
super-productivity (timers, a real day plan). Every verdict below was reached by driving the
harness live at `localhost:5741` and reading the render, not by inspecting source.

## What I REUSED vs BUILT

**Reused (the whole point — this is not a siloed app):**
- The **view registry** (`views/registry.ts` + `resolve.ts`): both new views are dropped folders
  with a `definition.tsx`, discovered at build time. Zero switcher edits.
- The **`ViewProps` contract**: rows arrive already searched + filtered, so neither view carries
  a filtering system. Saved views work with no task-specific machinery because the view-state
  bag is part of that contract.
- **`ObjectConfig`/`FieldDef`** unchanged: subtasks and dependencies are ordinary self-relations,
  so the table, board and calendar render task rows without knowing what a task is.
- `OptionChip` + `optionMeta` (status/priority chips), `activeFields`, `formatCell`,
  `useIsMobile`, the shadcn `DropdownMenu`, and the `--nx-*` token canvas for all chrome.
- The existing **table / kanban / calendar** views render the task object as-is — the `deals`-style
  config pattern carried over with no fork.

**Built:**
- `record-core/tasks.ts` — task shape (config factory), flat-store→derived tree, dependency
  reads, health, recurrence, the 34-task demo seed.
- `record-core/timeTracking.ts` — the entry-log timer model, budgets, the day plan.
- `record-core/taskSync.ts` — the issue-provider seam.
- `views/timeline/` — the Gantt view (model + component + css + definition).
- `views/focus/` — the Today view.
- Two fixes to SHARED views that my config exposed (below).

## Per-feature verdicts

| Feature | Verdict | Evidence |
|---|---|---|
| Task shape (title/status/assignee/dates/priority/labels/estimate/rich description) | ✅ | `tasks-table.png` — every field renders through the existing table |
| **Subtasks** (parent/child, flat store + derived tree) | ✅ | `tasks-timeline-light.png` — 4 epics with nested children, carets, `1/6` `2/6` `0/5` rollups |
| **Dependencies** (blocks / blocked-by) | ✅ | timeline arrows between bars; `tsk-0x` chips in the table's "Blocked by" column |
| Cycle / orphan safety in the tree | ✅ | unit-checked: a 2-node cycle neither hangs nor drops rows; a filtered-out parent re-roots its children |
| **Timeline: bars start→due on a time axis** | ✅ | `tasks-timeline-light.png` |
| Timeline: dependency arrows | ✅ | visible elbow connectors, incl. cross-epic (`Load test checkout path` ← `Stripe…`) |
| Timeline: drag-to-reschedule + edge resize | ✅ | pointer drag commits whole-day patches; a resize may not invert the bar |
| Timeline: zoom day/week/month/quarter | ✅ | segmented control; `PX_PER_DAY` density per zoom |
| Timeline: today marker | ✅ | vertical rule at 20 Jul in every timeline shot |
| Timeline: at-risk / overdue / blocked styling | ✅ | overdue titles render in `--nx-danger` |
| Timeline: critical path | ✅ | red-outlined bars along the longest incomplete chain |
| Timeline: registry view, not a bolted-on page | ✅ | `views/timeline/definition.tsx`, same contract as `views/calendar` |
| **Time tracking: per-task timer** | ✅ | `tasks-focus-timer-running.png` — banner, live clock, accent timer button |
| Time tracking: exactly one timer at a time | ✅ | driven live: starting row 3 flipped row 1 to `data-live="false"`; `store.filter(isTracking).length === 1` |
| Time tracking: spent vs estimate | ✅ | per-row meter (`4h 45m / 6h`), warning-toned when over |
| Time tracking: manual "log 15m/30m/1h" | ✅ | row overflow menu; unit-checked to append a 4th entry |
| Time tracking: survives reload | ✅ | elapsed is DERIVED from the entry log; no background ticker to lose |
| **Today/focus list distinct from the backlog** | ✅ | `tasks-focus-desktop-light.png` — day plan left, pull-in pane right |
| Focus: pull work into the day | ✅ | clicked a suggestion → planned count 6→7 |
| Focus: quick-add (title + enter) | ✅ | typed a title → landed in the plan as "Todo" |
| Focus: complete from the day | ✅ | stats moved `0/7 → 1/7`, strikethrough, chip → Done |
| Focus: reorder (drag + `[`/`]`) | ✅ | writes `focusOrder` across the plan in one pass |
| Focus: day stepper (plan tomorrow tonight) | ✅ | `focusDate` in the bag; "Back to today" appears off-today |
| Focus: "My tasks" scope | ✅ | `focusUser` scope picker |
| Focus: keyboard-first | ✅ | j/k/t/x/[/]/⌫/Enter, hint bar; hidden on mobile |
| Live day total ticks while a timer runs | ✅ | **was broken** — memo deps missed the tick; fixed, verified `3h 30m → 3h 31m` |
| Quick-add / inline editing on existing views | ✅ | table + board inline editing and bulk selection already existed and work on tasks unchanged |
| Bulk select + bulk edit | ✅ | harness bulk bar over the existing `selection` contract |
| Saved views / filters | ✅ | reuses `FilterBar`/`matchFilters` + the view-state bag; no parallel system |
| Issue-provider sync seam | ✅ | GitHub + Jira payload shapes, pure diff, second-pass link resolution, labeled mock — exercised, see below |
| Config-composable | ✅ | every key of both views optional; documented in `docs/RECIPES.md` |
| `--nx-*` tokens, light AND dark | ✅ | `tasks-focus-dark.png`, `tasks-timeline-dark.png` — no hardcoded colour anywhere in either css |
| Mobile 390px — list + board | ✅ | `tasks-focus-mobile.png`, `tasks-focus-mobile-add.png` — single pane + Today/Add switch |
| Mobile 390px — timeline (reduced story) | ✅ | `tasks-timeline-mobile.png` — compact rail, month zoom, carets + rollups legible |
| Demo density | ✅ | 34 tasks, 6 people, 4 epics, 13 labels, real dependency chains, 7 seeded time logs, a 5-task day plan |
| a11y | ⚠️ partial | see gaps |
| tsc clean | ✅ | 0 errors outside a pre-existing univerjs gap (below) |

## Defects I found by driving it, and fixed

1. **Day total froze while a timer ran.** The header memo re-rendered but didn't recompute (the
   tick wasn't a dependency). The row ticked, the header lied. Fixed; verified live.
2. **Running banner showed the task TOTAL, not the current stretch.** A running clock that reads
   "0:30:10" three seconds after you press play is wrong. Split: banner = `sessionSeconds`,
   row = task total.
3. **A completed recurring task silently re-appeared in Today looking untouched.** `rollRecurrencePatch`
   reset the status but left `plannedFor` and the time log — so the next occurrence inherited
   today's plan and the previous occurrence's hours. It now leaves the day and starts a clean log.
4. **Quick-add defaulted to "Backlog"** (first non-done status) — the wrong commitment for
   something you just pulled into today. Added `newTaskStatus`, defaulted to "Todo" for the task config.
5. **Timeline rail rows escaped the rail** (256px rows in a 168px rail): titles hard-clipped at
   the border with no ellipsis, and on mobile the carets and rollup badges were clipped away
   entirely. Fixed; then fixed the two regressions that surfaced (status chips wrapping to two
   lines and breaking the 36px row grid the bar canvas aligns to; assignees shrinking to one letter).
6. **`ObjectConfig.columns` was documented as default column visibility but no view honored it** —
   so the task table dumped the raw `timeEntries` JSON into a column. Fixed in `views/table/definition.tsx`
   (`defaultHidden`), which is the documented contract's real home. Applies only while the user
   has made no column choice; objects without `columns` are unaffected.
7. **Kanban card dates rendered as raw ISO** while the table formatted them. Routed `date`/`dateTime`
   through `formatCell`.

## Verification performed

- `tsc --noEmit`: clean (see the pre-existing-gap note).
- Vite dev build: clean, no app console errors (one pre-existing React `forwardRef` warning from
  the kanban toolbar's `Button`, unrelated to this lane; one 404 for a missing favicon in the harness).
- **25 pure-model assertions**, all passing (tree/flatten/collapse/cycle-safety, done-status
  derivation, rollups, overdue health, recurrence semantics, one-timer-at-a-time, budget maths,
  duration/clock formatting, day plan ordering, dayLoad, suggestion ranking + exclusion).
- **Sync seam exercised**: creates only unmatched issues; patches only CHANGED fields; surfaces
  orphans instead of deleting; never touches `localOnly` (day plan + time log); the link pass
  resolves external→local ids; GitHub `milestone.due_on`→date and label normalisation; Jira
  `timeoriginalestimate` 7200s→2h and "is blocked by" extraction.
- Live interaction at 1440×900 and 390×844, light and dark, screenshots at
  `reducedMotion: "no-preference"`.

## Honest gaps

- **The board and table have no task-SPECIFIC affordances beyond config.** Cards show
  assignee/priority/due via the new `cardFields`, but there is no subtask indent, no
  blocked/dependency badge and no overdue tone on the board or in the table. The timeline and
  Today views carry the task semantics; the shared views carry the data. Closing this properly
  means a task-aware badge layer in `KanbanBoard`/`DataTable`, which is a shared-component change
  I chose not to make unilaterally mid-flight across parallel lanes.
- **a11y is partial.** Keyboard navigation, roles and aria-labels are in place on the focus list,
  timer controls, checkboxes and the day stepper; the timeline's drag-to-reschedule has **no
  keyboard equivalent**, and its bar canvas is not screen-reader navigable (the rail is). Focus
  rings rely on `:focus-visible` throughout.
- **Drag-to-reorder in Today is HTML5 drag** (no touch fallback) — on mobile, reordering is the
  `[`/`]` path only, which is keyboard-only, so touch reordering is effectively missing.
- **Timer accuracy across a sleeping tab** is derived from wall-clock timestamps, which is right,
  but a stretch left running overnight will read as a very long session — there is no idle
  detection or "you left this running" prompt (super-productivity has one; this does not).
- **No unit tests committed.** The 25 assertions and the sync exercise were run against the built
  modules but this repo has no test runner or test directory, so I did not invent one. They are
  reproducible via esbuild-bundling the pure modules; if a runner lands, they should be ported.
- **`docs/RECIPES.md` did not exist** on this branch, so I created it rather than appending. If a
  parallel lane also creates it, the merge is additive per-section but will need a manual resolve.
- **Pre-existing, not mine:** `src/blocks/workbook/` imports `@univerjs/*`, which is not a declared
  dependency in `package.json` — `tsc` reports module-not-found there on a clean install. Zero
  errors elsewhere. Flagging rather than fixing (another lane owns that block).

## Parity table — against Linear / Asana / super-productivity

Not a self-certification. `≈` means present and comparable, `~` present but thinner than the
reference, `✗` absent.

| Capability | Reference | Us | Honest note |
|---|---|---|---|
| Task CRUD, status workflow, assignee, priority, labels | all three | ≈ | config-declared, arbitrary workflow states |
| Subtasks | Linear (sub-issues), Asana | ≈ | unlimited depth, derived tree, rollup counts |
| Dependencies (blocks / blocked-by) | Asana, Linear | ~ | modelled + drawn + drive critical path, but **no scheduling enforcement**: rescheduling a bar does not push its dependents, and there is no circular-dependency warning at edit time |
| Gantt/timeline with arrows | Asana Timeline | ≈ | bars, arrows, drag, resize, zoom, today, critical path |
| Timeline: auto-schedule / push dependents | Asana | ✗ | the gap I'd close first — today a drag moves one bar only |
| Timeline: baselines / slippage vs plan | MS-Project-class | ✗ | no stored baseline to compare against |
| Per-task timer, one at a time | super-productivity | ≈ | entry log, derived elapsed, reload-safe |
| Spent vs estimate | super-productivity | ≈ | per-task meter + day roll-up |
| Idle detection / "you left this running" | super-productivity | ✗ | an overnight timer just reads as a long session |
| Pomodoro / focus mode | super-productivity | ✗ | deliberately skipped as dilution; the brief allowed it only if free |
| Worklog / timesheet view (time by day × person) | Toggl-class, super-productivity | ✗ | the data is all there (`trackedSecondsOn`), the surface is not |
| Today / day planning distinct from backlog | super-productivity, Things | ≈ | explicit pull-in, ordered, day stepper |
| Quick-add | Linear (⌘K-fast) | ~ | title + enter into the day; **no natural-language parse** ("fix login fri 2h" → dates/labels) and no ⌘K command palette |
| Keyboard-first | Linear | ~ | focus list is fully keyed (j/k/t/x/[/]/⌫); **the timeline has no keyboard path for drag/reschedule**, and there is no global command palette or shortcut cheatsheet |
| Inline edit from list/board | all three | ≈ | pre-existing DataTable/board editing, works on tasks unchanged |
| Bulk select + bulk edit | Linear, Asana | ~ | selection + bulk patch exist via the shared contract; no bulk *dependency* or bulk *reparent* |
| Saved views / filters | all three | ≈ | reuses the host filter system + view-state bag |
| "My tasks" perspective | all three | ≈ | `focusUser` scope, and the timeline has its own assignee filter |
| Recurrence | super-productivity, Asana | ~ | daily/weekly/biweekly/monthly roll-forward on completion; **no RRULE, no "every 2nd Tuesday", no skip/reschedule-this-occurrence** |
| Issue-provider sync | Linear↔GitHub, Asana↔Jira | ~ (seam) | shapes + mapping + conservative diff are real and tested; **no auth, no polling, no webhook, no write-back** — by design, the consumer owns those |
| Board swimlanes / grouping beyond one field | Linear, Asana | ~ | group-by any select/user field; no two-axis swimlanes |
| Comments / activity / mentions | all three | ✗ | RecordPage has an activity+notes surface, not wired into the task views |
| Notifications / assignment alerts | all three | ✗ | out of scope for a component library, but it's why this isn't a product yet |
| Estimates in points + velocity/cycle analytics | Linear | ✗ | estimate is hours only; no cycle/burndown |
| Offline / local-first | Linear | ✗ | host-owned concern |

**The three I would fund first**, in order: (1) dependency-aware rescheduling on the timeline —
it's the one place the current behaviour can actively mislead a planner; (2) keyboard parity for
the timeline plus a command palette, which is what "keyboard-first" actually means at Linear's
bar; (3) a worklog/timesheet surface, which is nearly free given the entry log already exists.

## Where I think it stands against the bar

The Today view and the timer model are the parts I would defend hardest: the explicit-planning
rule, the one-timer invariant and the derived-elapsed design are the things that separate this
from a kanban board with a stopwatch glued on, and they are enforced in a pure, testable model
rather than in component state. The timeline is genuinely a Gantt (tree + arrows + critical path +
drag), and it is a registry view, so it is config-selectable on any object with two date fields —
not a tasks-only page.

What is not yet at Linear's bar: the shared table/board still read as generic record surfaces when
showing tasks, and timeline keyboard parity is missing. Both are named above rather than papered over.
