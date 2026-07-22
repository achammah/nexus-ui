import * as React from "react";
import { GanttChartSquare, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../../components/ui/dropdown-menu";
import { Button } from "../../../primitives/Button";
import { activeFields } from "../../options";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { ZOOM_LABELS, ZOOMS, type TimelineZoom } from "./model";
import { useIsMobile } from "../../../hooks/use-mobile";

/* Timeline (Gantt) view — tasks as bars on a time axis with subtask tree,
   dependency arrows, drag-to-reschedule, zoom, today marker, health styling and
   critical-path emphasis. Config keys (ALL optional — defaults resolve from the
   task shape TASK_KEYS, then the object's own fields):
   - startDateField / dueDateField (date|dateTime; a due-only task renders as a
     milestone diamond) · titleField · statusField (select — bar color comes from
     its option palette) · assigneeField (user) · progressField (number 0-100)
   - parentField (self-relation → subtask tree) · dependenciesField (multiple
     self-relation, "blocked by" ids → arrows)
   - doneStatuses (comma-separated status values that count complete; default:
     values named like done/complete/shipped/cancelled)
   - defaultZoom (day|week|month|quarter) · criticalPath (boolean; default on)
   State keys in the bag: `tlZoom` · `tlCollapsed` (id→true) · `tlAssignee`.
   The component is sizeable → lazy chunk. */

const TimelineView = React.lazy(() => import("./TimelineView"));

function TimelineToolbar({ object, users, viewState, onViewState, side }: ViewToolbarProps) {
  const isMobile = useIsMobile();
  if (side !== "trail") return null;
  const zoom = (viewState.tlZoom as TimelineZoom) || undefined;
  const assignee = typeof viewState.tlAssignee === "string" ? viewState.tlAssignee : "";
  const hasAssignee = activeFields(object.fields).some((f) => f.type === "user");
  return (
    <>
      {hasAssignee && users.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" icon={<UserRound size={13} />} data-testid="tl-assignee-filter">
              {assignee || "Everyone"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem checked={!assignee} onCheckedChange={() => onViewState({ tlAssignee: "" })}>
              Everyone
            </DropdownMenuCheckboxItem>
            {users.map((u) => (
              <DropdownMenuCheckboxItem key={u} checked={assignee === u} data-testid={`tl-assignee-${u}`} onCheckedChange={() => onViewState({ tlAssignee: u })}>
                {u}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!isMobile && (
        <div className="nxSeg" role="group" aria-label="Timeline zoom">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              className="nxSegBtn"
              data-active={(zoom ?? "week") === z}
              data-testid={`tl-zoom-${z}`}
              onClick={() => onViewState({ tlZoom: z })}
            >
              {ZOOM_LABELS[z]}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const definition: ViewDefinition = {
  type: "timeline",
  label: "Timeline",
  icon: <GanttChartSquare size={13} />,
  component: TimelineView,
  Toolbar: TimelineToolbar,
  configSchema: [
    { key: "startDateField", label: "Start date", kind: "field", fieldTypes: ["date", "dateTime"] },
    { key: "dueDateField", label: "Due date", kind: "field", fieldTypes: ["date", "dateTime"] },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "statusField", label: "Status", kind: "field", fieldTypes: ["select"] },
    { key: "assigneeField", label: "Assignee", kind: "field", fieldTypes: ["user"] },
    { key: "progressField", label: "Progress %", kind: "field", fieldTypes: ["number"] },
    { key: "parentField", label: "Parent (subtasks)", kind: "field", fieldTypes: ["relation"] },
    { key: "dependenciesField", label: "Blocked by", kind: "field", fieldTypes: ["relation"] },
    { key: "doneStatuses", label: "Done statuses (comma-sep)", kind: "text" },
    { key: "defaultZoom", label: "Default zoom", kind: "select", options: [...ZOOMS] },
    { key: "criticalPath", label: "Critical path", kind: "boolean" },
  ],
  defaultConfig: (object) => {
    const dates = activeFields(object.fields).filter((f) => f.type === "date" || f.type === "dateTime");
    return { startDateField: dates[0]?.key, dueDateField: dates[1]?.key ?? dates[0]?.key };
  },
  validateConfig: (object, cfg) => {
    const fields = activeFields(object.fields);
    const dates = fields.filter((f) => f.type === "date" || f.type === "dateTime");
    if (dates.length === 0) return `“${object.label}” has no date or dateTime field for a timeline`;
    for (const key of ["startDateField", "dueDateField"] as const) {
      const v = cfg[key];
      if (typeof v === "string" && v && !dates.some((f) => f.key === v))
        return `${key} “${v}” is not a date or dateTime field of ${object.key}`;
    }
    return null;
  },
};

export default definition;
