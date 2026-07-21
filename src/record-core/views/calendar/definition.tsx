import * as React from "react";
import { CalendarDays } from "lucide-react";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { useIsMobile } from "../../../hooks/use-mobile";
import { activeFields } from "../../options";
import { firstDateField, isDateField } from "./events";
import { ALL_VIEWS, SLOT_VALUES, SNAP_VALUES, VIEW_LABELS, WEEKDAYS, defaultView, enabledViews } from "./viewOptions";

/* Calendar view — the full-fidelity FullCalendar surface behind the registry
   contract. Config keys (all optional but startDateField):
   - startDateField (required; a date/dateTime field key — defaults to the first)
   - endDateField (optional; events become spans, resizable)
   - titleField (defaults to the primary), colorField (a select field; events take
     its own option palette), recurrenceField (a text field holding an RRULE string
     → its rows render as a recurring series, render-only)
   - defaultView / enabledViews (which of month·week·day·listWeek·listMonth·year the
     picker offers), editable, selectable, firstDay, slotDuration, snapDuration
     (the finer drag/create/resize increment), slotMinTime, slotMaxTime, scrollTime
     (the hour a time-grid view opens scrolled to), allDaySlot, weekNumbers,
     businessHours, nowIndicator, eventOverlap — every one resolved through the pure
     viewOptions mapping.
   State keys in the bag: `calView` (the chosen view) · `calDate` (the visible
   anchor — reload lands where you were). The component is heavy (the FullCalendar
   engine + plugins), so it ships as a lazy chunk. */

const CalendarView = React.lazy(() => import("./CalendarView"));

/* View picker — a segmented control RIGHT of the switcher (side "trail") showing
   only the enabled views; the choice persists in the bag as `calView`. Plain
   buttons (no floating-ui). Hidden on mobile, where the agenda list replaces the
   grids. */
function CalendarToolbar({ viewConfig, viewState, onViewState, side }: ViewToolbarProps) {
  const isMobile = useIsMobile();
  if (side !== "trail" || isMobile) return null;
  const enabled = enabledViews(viewConfig);
  if (enabled.length <= 1) return null;
  const cur =
    typeof viewState.calView === "string" && enabled.includes(viewState.calView as never)
      ? viewState.calView
      : defaultView(viewConfig, enabled);
  return (
    <div className="nxSeg nxCalPicker" role="group" aria-label="Calendar view">
      {enabled.map((v) => (
        <button
          key={v}
          type="button"
          className="nxSegBtn"
          data-active={cur === v}
          data-testid={`cal-view-${v}`}
          onClick={() => onViewState({ calView: v })}
        >
          {VIEW_LABELS[v]}
        </button>
      ))}
    </div>
  );
}

const definition: ViewDefinition = {
  type: "calendar",
  label: "Calendar",
  icon: <CalendarDays size={13} />,
  component: CalendarView,
  Toolbar: CalendarToolbar,
  configSchema: [
    { key: "startDateField", label: "Start date", kind: "field", fieldTypes: ["date", "dateTime"], required: true },
    { key: "endDateField", label: "End date", kind: "field", fieldTypes: ["date", "dateTime"] },
    { key: "titleField", label: "Title", kind: "field" },
    { key: "colorField", label: "Color by", kind: "field", fieldTypes: ["select"] },
    { key: "recurrenceField", label: "Recurrence rule", kind: "field", fieldTypes: ["text"] },
    { key: "defaultView", label: "Default view", kind: "select", options: [...ALL_VIEWS] },
    { key: "enabledViews", label: "Views", kind: "multiSelect", options: [...ALL_VIEWS] },
    { key: "editable", label: "Editable", kind: "boolean" },
    { key: "selectable", label: "Drag to create", kind: "boolean" },
    { key: "firstDay", label: "Week starts", kind: "select", options: [...WEEKDAYS] },
    { key: "slotDuration", label: "Time slot", kind: "select", options: [...SLOT_VALUES] },
    { key: "snapDuration", label: "Snap to", kind: "select", options: [...SNAP_VALUES] },
    { key: "slotMinTime", label: "Day starts (HH:MM)", kind: "text" },
    { key: "slotMaxTime", label: "Day ends (HH:MM)", kind: "text" },
    { key: "scrollTime", label: "Opens at (HH:MM)", kind: "text" },
    { key: "allDaySlot", label: "All-day lane", kind: "boolean" },
    { key: "weekNumbers", label: "Week numbers", kind: "boolean" },
    { key: "businessHours", label: "Shade business hours", kind: "boolean" },
    { key: "nowIndicator", label: "Now indicator", kind: "boolean" },
    { key: "eventOverlap", label: "Allow overlap", kind: "boolean" },
  ],
  defaultConfig: (object) => ({ startDateField: firstDateField(activeFields(object.fields))?.key }),
  validateConfig: (object, cfg) => {
    const dateFields = activeFields(object.fields).filter((f) => isDateField(f));
    if (dateFields.length === 0) return `“${object.label}” has no date or dateTime field for a calendar`;
    const s = cfg.startDateField;
    if (typeof s === "string" && s && !dateFields.some((f) => f.key === s))
      return `startDateField “${s}” is not a date or dateTime field of ${object.key}`;
    return null;
  },
};

export default definition;
