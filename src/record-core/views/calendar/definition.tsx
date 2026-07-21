import * as React from "react";
import { CalendarDays } from "lucide-react";
import type { ViewDefinition, ViewToolbarProps } from "../types";
import { useIsMobile } from "../../../hooks/use-mobile";
import { activeFields } from "../../options";
import { firstDateField, isDateField } from "./events";

/* Calendar view — FullCalendar behind the registry contract. Config keys:
   `startDateField` (required; a date/dateTime field key — defaults to the first),
   `endDateField` (optional; events become spans, resizable), `titleField`
   (defaults to the primary), `colorField` (a select field; events take its own
   option palette). State keys in the bag: `calMode` ("month" | "week") ·
   `calDate` (the visible anchor — reload lands where you were). The component is
   heavy (the FullCalendar engine), so it ships as a lazy chunk. */

const CalendarView = React.lazy(() => import("./CalendarView"));

/* Month⇄Week segmented toggle — RIGHT of the switcher (side "trail"). Hidden on
   mobile, where the agenda list replaces both grids. */
function CalendarToolbar({ viewState, onViewState, side }: ViewToolbarProps) {
  const isMobile = useIsMobile();
  if (side !== "trail" || isMobile) return null;
  const mode = viewState.calMode === "week" ? "week" : "month";
  return (
    <div className="nxSeg" role="group" aria-label="Calendar range">
      <button
        type="button"
        className="nxSegBtn"
        data-active={mode === "month"}
        data-testid="cal-mode-month"
        onClick={() => onViewState({ calMode: "month" })}
      >
        Month
      </button>
      <button
        type="button"
        className="nxSegBtn"
        data-active={mode === "week"}
        data-testid="cal-mode-week"
        onClick={() => onViewState({ calMode: "week" })}
      >
        Week
      </button>
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
