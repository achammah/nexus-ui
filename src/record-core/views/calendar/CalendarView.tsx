import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, EventDropArg, EventInput, EventMountArg } from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../primitives/Button";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { OptionColor } from "../../types";
import { activeFields, chipStyle, optionMeta } from "../../options";
import { formatCell } from "../../DataTable";
import type { ViewProps } from "../types";
import type { CalendarFields } from "./events";
import {
  addMonths,
  createPrefill,
  firstDateField,
  isDateField,
  localDay,
  patchForDrop,
  patchForResize,
  rowsToEvents,
} from "./events";
import { AgendaList } from "./AgendaList";
import "./calendar.css";

/* CalendarView — FullCalendar (month/week) behind the ViewProps contract. Records
   with a valid start date render as events (colors from the colorField's own
   select-option palette — the same chipStyle the table chips and kanban columns
   use); dragging an event PATCHes the date field(s) through the host's store path
   (host toasts "Saved" / reverts on failure); clicking an empty day seeds the
   host's create dialog with that date. On mobile (≤768px) the grid swaps for the
   AgendaList — a structurally different render path, never a squeezed month.
   State in the bag: `calMode` ("month" | "week") · `calDate` (visible anchor).
   Week mode picks its grid by the start field: all-day `date` objects get the
   one-row dayGridWeek, timed `dateTime` objects get the hourly timeGridWeek. */

export default function CalendarView({
  object,
  rows,
  readOnly,
  viewConfig,
  viewState,
  onViewState,
  onOpen,
  onPatch,
  onCreateDraft,
}: ViewProps) {
  const isMobile = useIsMobile();

  const fields = React.useMemo<CalendarFields>(() => {
    const byKey = (k: unknown) => (typeof k === "string" ? object.fields.find((f) => f.key === k) : undefined);
    const cfgStart = byKey(viewConfig.startDateField);
    // validateConfig gates rendering, so a date-typed start always resolves here
    const start = (isDateField(cfgStart) ? cfgStart : undefined) ?? firstDateField(activeFields(object.fields))!;
    const cfgEnd = byKey(viewConfig.endDateField);
    const cfgColor = byKey(viewConfig.colorField);
    return {
      start,
      end: isDateField(cfgEnd) ? cfgEnd : undefined,
      title: byKey(viewConfig.titleField) ?? object.fields.find((f) => f.primary) ?? object.fields[0],
      color: cfgColor?.type === "select" ? cfgColor : undefined,
    };
  }, [object, viewConfig]);

  const { events, dated } = React.useMemo(
    () =>
      rowsToEvents(rows, fields, {
        formatTitle: (v) => formatCell(v, fields.title.type),
        colorOf: (f, v) => optionMeta(f, v).color,
      }),
    [rows, fields],
  );

  // engine-agnostic events → FullCalendar inputs; a configured colorField paints
  // every event with the shared chip formula (uncolored options get the neutral chip)
  const fcEvents = React.useMemo<EventInput[]>(
    () =>
      events.map((ev) => {
        const style = fields.color ? chipStyle(ev.color as OptionColor | undefined) : undefined;
        return {
          id: ev.id,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          allDay: ev.allDay,
          backgroundColor: (style?.background as string | undefined) ?? undefined,
          textColor: (style?.color as string | undefined) ?? undefined,
          extendedProps: { color: ev.color },
        };
      }),
    [events, fields.color],
  );

  const mode = viewState.calMode === "week" ? "week" : "month";
  const anchor = typeof viewState.calDate === "string" ? viewState.calDate : undefined;
  const allDay = fields.start.type === "date";
  const fcView = mode === "week" ? (allDay ? "dayGridWeek" : "timeGridWeek") : "dayGridMonth";

  const fcRef = React.useRef<FullCalendar | null>(null);
  const [title, setTitle] = React.useState("");
  const [announce, setAnnounce] = React.useState("");

  // viewState is the source of truth; the FC API follows it (mode toggle in the
  // toolbar, saved-view/applyView restores)
  React.useEffect(() => {
    const api = fcRef.current?.getApi();
    if (api && api.view.type !== fcView) api.changeView(fcView);
  }, [fcView]);
  React.useEffect(() => {
    const api = fcRef.current?.getApi();
    if (api && anchor && localDay(api.view.currentStart) !== anchor) api.gotoDate(anchor);
  }, [anchor]);

  const onDatesSet = (arg: DatesSetArg) => {
    setTitle(arg.view.title);
    const cur = localDay(arg.view.currentStart);
    if (viewState.calDate !== cur) onViewState({ calDate: cur });
  };

  const onEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    onOpen(info.event.id);
  };

  const onDateClick = (info: DateClickArg) => {
    onCreateDraft?.(createPrefill(info.dateStr, fields.start));
  };

  const onEventDrop = (info: EventDropArg) => {
    const patch = patchForDrop(
      { startStr: info.event.startStr, endStr: info.event.endStr || null, allDay: info.event.allDay },
      fields,
    );
    onPatch(info.event.id, patch);
    setAnnounce(`${info.event.title} moved to ${formatCell(patch[fields.start.key], fields.start.type)}`);
  };

  const onEventResize = (info: EventResizeDoneArg) => {
    const patch = patchForResize(
      { startStr: info.event.startStr, endStr: info.event.endStr, allDay: info.event.allDay },
      fields,
    );
    if (fields.end && Object.keys(patch).length) {
      onPatch(info.event.id, patch);
      setAnnounce(`${info.event.title} now ends ${formatCell(patch[fields.end.key], fields.end.type)}`);
    }
  };

  // keyboard path: events are focusable (eventDidMount) and Enter/Space opens the
  // peek — one delegated listener instead of a handler per event element
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const id = (e.target as HTMLElement).closest?.("[data-event-id]")?.getAttribute("data-event-id");
    if (id) {
      e.preventDefault();
      onOpen(id);
    }
  };

  const onEventDidMount = (info: EventMountArg) => {
    const el = info.el;
    el.setAttribute("data-testid", `calendar-event-${info.event.id}`);
    el.setAttribute("data-event-id", info.event.id);
    el.setAttribute("data-color", String(info.event.extendedProps.color ?? "none"));
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${info.event.title}, ${formatCell(info.event.startStr, fields.start.type)}`);
  };

  // desktop nav drives the FC API (datesSet persists the anchor); the agenda has
  // no FC instance, so its nav moves the anchor month directly
  const goPrev = () => {
    if (isMobile) onViewState({ calDate: addMonths(anchor ?? localDay(new Date()), -1) });
    else fcRef.current?.getApi().prev();
  };
  const goNext = () => {
    if (isMobile) onViewState({ calDate: addMonths(anchor ?? localDay(new Date()), 1) });
    else fcRef.current?.getApi().next();
  };
  const goToday = () => {
    if (isMobile) onViewState({ calDate: localDay(new Date()) });
    else fcRef.current?.getApi().today();
  };

  const agendaAnchor = (anchor ?? localDay(new Date())).slice(0, 8) + "01";
  const agendaTitle = new Date(agendaAnchor + "T00:00:00").toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div
      className="nxCalendar"
      data-testid={`calendar-${object.key}`}
      data-cal-mode={mode}
      data-can-create={onCreateDraft ? "true" : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="nxCalHead">
        <div className="nxCalNav">
          <Button size="sm" variant="ghost" icon={<ChevronLeft size={14} />} aria-label="Previous" data-testid="calendar-prev" onClick={goPrev} />
          <Button size="sm" variant="ghost" data-testid="calendar-today" onClick={goToday}>
            Today
          </Button>
          <Button size="sm" variant="ghost" icon={<ChevronRight size={14} />} aria-label="Next" data-testid="calendar-next" onClick={goNext} />
        </div>
        <span className="nxCalTitle" data-testid="calendar-title">
          {isMobile ? agendaTitle : title}
        </span>
      </div>
      <div className="nxCalSrOnly" aria-live="polite">
        {announce}
      </div>
      {dated === 0 && (
        <div className="nxCard nxCalEmpty nx-rise-in-sm" data-testid="calendar-empty">
          No {object.label.toLowerCase()} with a {fields.start.label.toLowerCase()} yet
          {onCreateDraft ? " — click a day to add one" : ""}.
        </div>
      )}
      {isMobile ? (
        <AgendaList
          anchor={agendaAnchor}
          events={events}
          onOpen={onOpen}
          onCreateDraft={onCreateDraft ? (day) => onCreateDraft(createPrefill(day, fields.start)) : undefined}
        />
      ) : (
        <FullCalendar
          ref={fcRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={fcView}
          initialDate={anchor}
          headerToolbar={false}
          firstDay={1}
          height={fcView === "timeGridWeek" ? 640 : "auto"}
          dayMaxEvents
          events={fcEvents}
          editable={!readOnly}
          eventDurationEditable={!readOnly && !!fields.end}
          datesSet={onDatesSet}
          eventClick={onEventClick}
          dateClick={onCreateDraft ? onDateClick : undefined}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventDidMount={onEventDidMount}
        />
      )}
    </div>
  );
}
