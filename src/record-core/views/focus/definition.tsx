import * as React from "react";
import { Target } from "lucide-react";
import { activeFields } from "../../options";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { isoDay } from "../../tasks";
import { TIME_KEYS } from "../../timeTracking";

/* Focus (Today) view — the day-planning surface: an ordered day plan with
   per-task timers on the left, a pull-in pane (due/overdue suggestions +
   backlog) on the right. Config keys (ALL optional — defaults resolve from the
   task shape, then the object's own fields):
   - titleField · statusField (select) · assigneeField (user) · dueDateField
   - estimateField (number, HOURS — drives the spent-vs-estimate meter)
   - timeEntriesField (json, the TimeEntry[] log the timer appends to)
   - plannedForField (date) + focusOrderField (number) — the day plan itself
   - doneStatuses (comma-separated status values counting as complete)
   State keys in the bag: `focusDate` · `focusUser` · `focusPane`.

   Planning is EXPLICIT: a due date never drafts work into the day, it only
   SUGGESTS. Exactly one timer runs at a time across the whole task set. */

const FocusView = React.lazy(() => import("./FocusView"));

/* Toolbar: jump to today — the one control that belongs in the view bar rather
   than in the pane header (the day stepper lives with the day it steps). */
function FocusToolbar({ viewState, onViewState, side }: ViewToolbarProps) {
  if (side !== "trail") return null;
  const today = isoDay(new Date());
  const on = typeof viewState.focusDate === "string" ? viewState.focusDate : today;
  if (on === today) return null;
  return (
    <button type="button" className="nxSegBtn" data-testid="focus-toolbar-today" onClick={() => onViewState({ focusDate: today })}>
      Back to today
    </button>
  );
}

const definition: ViewDefinition = {
  type: "focus",
  label: "Today",
  icon: <Target size={13} />,
  component: FocusView,
  Toolbar: FocusToolbar,
  configSchema: [
    { key: "titleField", label: "Title", kind: "field" },
    { key: "statusField", label: "Status", kind: "field", fieldTypes: ["select"] },
    { key: "assigneeField", label: "Assignee", kind: "field", fieldTypes: ["user"] },
    { key: "dueDateField", label: "Due date", kind: "field", fieldTypes: ["date", "dateTime"] },
    { key: "estimateField", label: "Estimate (hours)", kind: "field", fieldTypes: ["number"] },
    { key: "timeEntriesField", label: "Time log", kind: "field", fieldTypes: ["json"] },
    { key: "plannedForField", label: "Planned for", kind: "field", fieldTypes: ["date"] },
    { key: "focusOrderField", label: "Focus order", kind: "field", fieldTypes: ["number"] },
    { key: "doneStatuses", label: "Done statuses (comma-sep)", kind: "text" },
    { key: "newTaskStatus", label: "Status for new/reopened tasks", kind: "text" },
  ],
  defaultConfig: () => ({}),
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const has = (k: string) => fields.some((f) => f.key === k);
    /* the day plan needs somewhere to live — without a planned-for date field
       there is no "today" to pull into */
    const planned = typeof cfg.plannedForField === "string" && cfg.plannedForField ? cfg.plannedForField : TIME_KEYS.plannedFor;
    if (!has(planned))
      return `“${object.label}” has no “${planned}” date field for the day plan — add one, or set plannedForField`;
    for (const [key, label] of [["plannedForField", "date"], ["focusOrderField", "number"], ["timeEntriesField", "json"]] as const) {
      const v = cfg[key];
      if (typeof v === "string" && v && !has(v)) return `${key} “${v}” is not a ${label} field of ${object.key}`;
    }
    return null;
  },
};

export default definition;
