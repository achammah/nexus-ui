import * as React from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import multiMonthPlugin from "@fullcalendar/multimonth";
import rrulePlugin from "@fullcalendar/rrule";
import type { DateSelectArg, DatesSetArg, EventClickArg, EventDropArg, EventInput, EventMountArg } from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg } from "@fullcalendar/interaction";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../../../primitives/Button";
import { useIsMobile } from "../../../hooks/use-mobile";
import type { OptionColor, RecordRow } from "../../types";
import { activeFields, chipStyle, optionMeta } from "../../options";
import { formatCell } from "../../DataTable";
import type { ViewProps } from "../types";
import type { CalendarFields } from "./events";
import {
  addDays,
  addMonths,
  createPrefill,
  firstDateField,
  isDateField,
  localDay,
  patchForDrop,
  patchForResize,
  rangePrefill,
  rowsToEvents,
} from "./events";
import {
  configEditable,
  configSelectable,
  defaultView,
  enabledViews,
  fcViewType,
  viewOptions,
} from "./viewOptions";
import { AgendaList } from "./AgendaList";
import { EventEditDialog } from "./EventEditDialog";
import "./calendar.css";

/* hourly time-grid axis labels + event times in the app's 24h idiom (the same
   format AgendaList uses), so every hour is labelled and events read "09:00 – 10:00" */
const SLOT_LABEL_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const;
const EVENT_TIME_FORMAT = { hour: "2-digit", minute: "2-digit", hour12: false } as const;

/* CalendarView — the full-fidelity FullCalendar surface behind the ViewProps
   contract. Records with a valid start render as events (colors from the
   colorField's own select-option palette — the same chipStyle the table chips and
   kanban columns use). Every option is config-driven through the pure viewOptions
   mapping (the single source): the enabled view set + default, editability,
   range-selection, first day, time slots, week numbers, business hours, the now
   line, overlap, and a render-only recurrence field (an RRULE string → occurrences
   expand via FC's rrule plugin). Clicking an event opens a quick edit dialog
   (title/dates/all-day/color/other fields, open-full-record, delete-with-confirm);
   a drag-select creates a prefilled range; drag/resize PATCH the date field(s)
   through the host store. On mobile (≤768px) the grid swaps for the AgendaList (a
   list, never a squeezed grid) and the edit surface is a bottom sheet.
   State in the bag: `calView` (the chosen view) · `calDate` (the visible anchor). */

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
  onDelete,
}: ViewProps) {
  const isMobile = useIsMobile();

  const fields = React.useMemo<CalendarFields>(() => {
    const byKey = (k: unknown) => (typeof k === "string" ? object.fields.find((f) => f.key === k) : undefined);
    const cfgStart = byKey(viewConfig.startDateField);
    // validateConfig gates rendering, so a date-typed start always resolves here
    const start = (isDateField(cfgStart) ? cfgStart : undefined) ?? firstDateField(activeFields(object.fields))!;
    const cfgEnd = byKey(viewConfig.endDateField);
    const cfgColor = byKey(viewConfig.colorField);
    const cfgRecur = byKey(viewConfig.recurrenceField);
    return {
      start,
      end: isDateField(cfgEnd) ? cfgEnd : undefined,
      title: byKey(viewConfig.titleField) ?? object.fields.find((f) => f.primary) ?? object.fields[0],
      color: cfgColor?.type === "select" ? cfgColor : undefined,
      recurrence: cfgRecur?.type === "text" ? cfgRecur : undefined,
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
  // every event with the shared chip formula. A recurring row carries an rrule
  // (its DTSTART composed in events.ts) instead of a start/end, and stays
  // drag-locked (render-only recurrence — per-occurrence edits are out of scope)
  const fcEvents = React.useMemo<EventInput[]>(
    () =>
      events.map((ev) => {
        const style = fields.color ? chipStyle(ev.color as OptionColor | undefined) : undefined;
        const base: EventInput = {
          id: ev.id,
          title: ev.title,
          allDay: ev.allDay,
          backgroundColor: (style?.background as string | undefined) ?? undefined,
          textColor: (style?.color as string | undefined) ?? undefined,
          extendedProps: { color: ev.color },
        };
        if (ev.rrule) return { ...base, rrule: ev.rrule, duration: ev.duration, editable: false };
        return { ...base, start: ev.start, end: ev.end };
      }),
    [events, fields.color],
  );

  // config-driven view resolution (the single source is viewOptions.ts)
  const objectAllDay = fields.start.type === "date";
  const enabled = React.useMemo(() => enabledViews(viewConfig), [viewConfig]);
  const curView =
    typeof viewState.calView === "string" && enabled.includes(viewState.calView as never)
      ? (viewState.calView as ReturnType<typeof defaultView>)
      : defaultView(viewConfig, enabled);
  const fcView = fcViewType(curView, objectAllDay);
  const opts = React.useMemo(() => viewOptions(viewConfig), [viewConfig]);
  const editable = configEditable(viewConfig) && !readOnly;
  const selectable = configSelectable(viewConfig) && !!onCreateDraft;

  const anchor = typeof viewState.calDate === "string" ? viewState.calDate : undefined;

  const fcRef = React.useRef<FullCalendar | null>(null);
  const [title, setTitle] = React.useState("");
  const [announce, setAnnounce] = React.useState("");
  const [editing, setEditing] = React.useState<RecordRow | null>(null);

  // a bounded, viewport-responsive scroll window for the time grid (Google-style):
  // it opens at scrollTime with the full 24h reachable by scroll; month/list/year
  // size to their own content ("auto")
  const [gridH, setGridH] = React.useState(() =>
    typeof window === "undefined" ? 700 : Math.max(560, Math.min(900, window.innerHeight - 210)),
  );
  React.useEffect(() => {
    const onResize = () => setGridH(Math.max(560, Math.min(900, window.innerHeight - 210)));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // viewState is the source of truth; the FC API follows it (picker choice,
  // saved-view/applyView restores)
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

  const openEditor = (id: string) => {
    const row = rows.find((r) => String(r.id) === id);
    if (row) setEditing(row);
  };

  const onEventClick = (info: EventClickArg) => {
    info.jsEvent.preventDefault();
    openEditor(info.event.id);
  };

  // create wiring: a single click seeds a single-day/slot create (dateClick), a
  // multi-unit drag-select seeds a prefilled RANGE (select). FC fires `select` on a
  // single click too, so onSelect only acts on a genuine range — otherwise dateClick
  // owns the point and there is no double-create.
  const onDateClick = (info: DateClickArg) => {
    onCreateDraft?.(createPrefill(info.dateStr, fields.start));
  };
  const slotMs = () => {
    const [h, m] = opts.slotDuration.split(":").map(Number);
    return ((h || 0) * 60 + (m || 0)) * 60000;
  };
  const onSelect = (info: DateSelectArg) => {
    const isRange = info.allDay
      ? addDays(info.startStr.slice(0, 10), 1) < info.endStr.slice(0, 10)
      : Date.parse(info.endStr) - Date.parse(info.startStr) > slotMs();
    if (isRange) onCreateDraft?.(rangePrefill(info.startStr, info.endStr, fields, info.allDay));
    fcRef.current?.getApi().unselect();
  };

  const onEventDrop = (info: EventDropArg) => {
    const patch = patchForDrop(
      { startStr: info.event.startStr, endStr: info.event.endStr || null, allDay: info.event.allDay },
      fields,
    );
    onPatch(info.event.id, patch);
    setAnnounce(`${info.event.title} moved to ${formatCell(patch[fields.start.key], fields.start.type)}`);
  };

  // resize from EITHER edge (eventResizableFromStart): patchForResize writes both
  // the start and the end field, so dragging the top edge persists the new start
  const onEventResize = (info: EventResizeDoneArg) => {
    const patch = patchForResize(
      { startStr: info.event.startStr, endStr: info.event.endStr, allDay: info.event.allDay },
      fields,
    );
    if (Object.keys(patch).length) {
      onPatch(info.event.id, patch);
      setAnnounce(`${info.event.title} resized to ${formatCell(patch[fields.start.key], fields.start.type)}`);
    }
  };

  // keyboard path: events are focusable (eventDidMount) and Enter/Space opens the
  // edit dialog — one delegated listener instead of a handler per event element
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const id = (e.target as HTMLElement).closest?.("[data-event-id]")?.getAttribute("data-event-id");
    if (id) {
      e.preventDefault();
      openEditor(id);
    }
  };

  const onEventDidMount = (info: EventMountArg) => {
    const el = info.el;
    el.setAttribute("data-testid", `calendar-event-${info.event.id}`);
    el.setAttribute("data-event-id", info.event.id);
    el.setAttribute("data-color", String(info.event.extendedProps.color ?? "none"));
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    const startStr = info.event.startStr || info.event.start ? formatCell(info.event.startStr, fields.start.type) : "";
    el.setAttribute("aria-label", `${info.event.title}${startStr ? `, ${startStr}` : ""}`);
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

  const timed = fcView.startsWith("timeGrid");

  return (
    <div
      className="nxCalendar"
      data-testid={`calendar-${object.key}`}
      data-cal-view={curView}
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
          onOpen={openEditor}
          onCreateDraft={onCreateDraft ? (day) => onCreateDraft(createPrefill(day, fields.start)) : undefined}
        />
      ) : (
        <FullCalendar
          ref={fcRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin, multiMonthPlugin, rrulePlugin]}
          initialView={fcView}
          initialDate={anchor}
          headerToolbar={false}
          firstDay={opts.firstDay}
          weekNumbers={opts.weekNumbers}
          nowIndicator={opts.nowIndicator}
          businessHours={opts.businessHours}
          eventOverlap={opts.eventOverlap}
          slotDuration={opts.slotDuration}
          snapDuration={opts.snapDuration}
          slotMinTime={opts.slotMinTime}
          slotMaxTime={opts.slotMaxTime}
          scrollTime={opts.scrollTime}
          slotLabelInterval="01:00:00"
          slotLabelFormat={SLOT_LABEL_FORMAT}
          eventTimeFormat={EVENT_TIME_FORMAT}
          allDaySlot={opts.allDaySlot}
          expandRows
          height={timed ? gridH : "auto"}
          dayMaxEvents
          navLinks
          navLinkDayClick={(date) => onViewState({ calView: enabled.includes("day" as never) ? "day" : curView, calDate: localDay(date) })}
          navLinkWeekClick={(weekStart) => onViewState({ calView: enabled.includes("week" as never) ? "week" : curView, calDate: localDay(weekStart) })}
          events={fcEvents}
          editable={editable}
          eventDurationEditable={editable && !!fields.end}
          eventResizableFromStart={editable && !!fields.end}
          selectable={selectable}
          selectMirror
          datesSet={onDatesSet}
          eventClick={onEventClick}
          dateClick={onCreateDraft ? onDateClick : undefined}
          select={selectable ? onSelect : undefined}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventDidMount={onEventDidMount}
        />
      )}
      {editing && (
        <EventEditDialog
          key={String(editing.id)}
          object={object}
          row={editing}
          fields={fields}
          canEdit={editable}
          canDelete={!!onDelete}
          onClose={() => setEditing(null)}
          onPatch={onPatch}
          onDelete={onDelete}
          onOpen={onOpen}
        />
      )}
    </div>
  );
}
