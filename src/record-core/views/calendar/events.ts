import type { FieldDef, RecordRow } from "../../types";

/* Pure record→event mapping for the calendar view — no browser, no FullCalendar,
   no React: unit-testable under node:test (the starter's journeys/unit/ exercises
   it). CalendarView feeds it the resolved field defs plus two injected resolvers
   (title formatting via formatCell, color via optionMeta) so this module never
   imports a JSX file.

   Date semantics:
   - a `date` field value is a day string ("2026-08-14") → an ALL-DAY event;
   - a `dateTime` field value is an ISO instant → a TIMED event;
   - the record's end date is INCLUSIVE ("to 2026-08-12" includes the 12th) while
     an all-day calendar end is EXCLUSIVE — spanToEventEnd/eventEndToSpan convert
     at the boundary so neither side leaks the other's convention;
   - malformed data never crashes a render: a row with a missing/invalid start is
     excluded (the `dated` count drives the empty state), an end before its start
     is dropped (the event renders at its start). */

/* the calendar's resolved field handles — CalendarView looks these up once */
export interface CalendarFields {
  start: FieldDef;
  end?: FieldDef;
  title: FieldDef;
  color?: FieldDef;
  /* a text field holding an RRULE string ("FREQ=WEEKLY;BYDAY=MO") — its rows
     render as a recurring series instead of a single event (render-only) */
  recurrence?: FieldDef;
}

/* engine-agnostic event — CalendarView maps this onto FullCalendar's EventInput.
   A recurring row carries `rrule` (+ optional `duration`) INSTEAD of a plain
   start/end: FullCalendar's rrule plugin expands it, taking its DTSTART from the
   composed string, so CalendarView omits start/end when rrule is present. */
export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  /* OptionColor name from the color field's own option palette */
  color?: string;
  /* an FC rrule-plugin input string (DTSTART + RRULE) when the row recurs */
  rrule?: string;
  /* each occurrence's length ("HH:MM") for a timed recurring event with an end */
  duration?: string;
}

export const isDateField = (f?: FieldDef): boolean => !!f && (f.type === "date" || f.type === "dateTime");

/* defaultConfig's pick — first date/dateTime field of the (already active-filtered) list */
export const firstDateField = (fields: FieldDef[]): FieldDef | undefined => fields.find((f) => isDateField(f));

/* "2026-08-14[T…]" → "2026-08-14"; anything else (empty, prose, bad month) → null */
export const parseDay = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const day = v.slice(0, 10);
  return Number.isNaN(new Date(day + "T00:00:00Z").getTime()) ? null : day;
};

/* a parseable ISO instant for timed events; day-only strings also qualify */
const parseInstant = (v: unknown): string | null =>
  typeof v === "string" && v !== "" && !Number.isNaN(Date.parse(v)) ? v : null;

/* EXACTLY a day string ("2026-08-14", no time part). A `dateTime` field holding one
   is an ALL-DAY event (the Google-Calendar model: an event is all-day or timed
   independent of the field type), which is how the all-day lane + the edit dialog's
   all-day toggle work on a timed object. */
export const isDateOnly = (v: unknown): boolean => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());

/* day arithmetic in UTC — day strings carry no timezone, so UTC math is exact */
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* a local Date → its LOCAL day string (Date#toISOString would shift the day for
   timezones ahead of UTC — the calendar anchor must never drift a day) */
export const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const addMonths = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

/* inclusive record span end → exclusive all-day event end, and back */
export const spanToEventEnd = (endDay: string): string => addDays(endDay, 1);
export const eventEndToSpan = (exclusiveEnd: string): string => addDays(exclusiveEnd, -1);

export const rowsToEvents = (
  rows: RecordRow[],
  fields: CalendarFields,
  resolve: {
    formatTitle: (v: unknown) => string;
    colorOf?: (field: FieldDef, v: unknown) => string | undefined;
  },
): { events: CalEvent[]; dated: number } => {
  // a `date` field is all-day for every row; a `dateTime` field is all-day per-row
  // only when its value is date-only (mixed all-day + timed events, FC-native)
  const objectAllDay = fields.start.type === "date";
  const events: CalEvent[] = [];
  for (const row of rows) {
    const rawStart = row[fields.start.key];
    const allDay = objectAllDay || isDateOnly(rawStart);
    const start = allDay ? parseDay(rawStart) : parseInstant(rawStart);
    if (!start) continue; // undated/malformed rows stay out of the grid (empty state counts them)
    const ev: CalEvent = {
      id: String(row.id),
      title: resolve.formatTitle(row[fields.title.key]) || String(row.id),
      start,
      allDay,
    };
    if (fields.end) {
      const rawEnd = row[fields.end.key];
      if (allDay) {
        const endDay = parseDay(rawEnd);
        // inclusive span → exclusive event end; an end before its start is dropped
        if (endDay && endDay >= start) ev.end = spanToEventEnd(endDay);
      } else {
        const endIso = parseInstant(rawEnd);
        if (endIso && Date.parse(endIso) >= Date.parse(start)) ev.end = endIso;
      }
    }
    if (fields.recurrence) {
      const rec = recurrenceInput(start, allDay, row[fields.recurrence.key], ev.end);
      if (rec) {
        ev.rrule = rec.rrule;
        if (rec.duration) ev.duration = rec.duration;
      }
    }
    if (fields.color && resolve.colorOf) ev.color = resolve.colorOf(fields.color, row[fields.color.key]);
    events.push(ev);
  }
  return { events, dated: events.length };
};

/* a dropped START value in the field's own representation. FullCalendar reports an
   all-day drop as a day string and a timed drop as an ISO instant; a `date` field
   always stores the day, and a `dateTime` field flipped INTO the all-day lane
   stores a DATE-ONLY value (an ISO again when dropped back in a slot) — the same
   date-only ⇔ all-day convention rowsToEvents reads back. */
const dropStart = (startStr: string, allDay: boolean, type: string): string =>
  type === "date" || allDay ? startStr.slice(0, 10) : startStr;

/* the dropped END value: an all-day edge (either field type) stores the inclusive
   span end (FC's all-day end is exclusive); a timed edge stores the ISO */
const dropEnd = (endStr: string, allDay: boolean, type: string): string =>
  type === "date" || allDay ? eventEndToSpan(endStr.slice(0, 10)) : endStr;

/* the patch a DROP writes: the start field always; the end field only when the
   dropped event still carries an end (FC moves both ends of a span together) */
export const patchForDrop = (
  ev: { startStr: string; endStr?: string | null; allDay: boolean },
  fields: CalendarFields,
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {
    [fields.start.key]: dropStart(ev.startStr, ev.allDay, fields.start.type),
  };
  if (fields.end && ev.endStr) patch[fields.end.key] = dropEnd(ev.endStr, ev.allDay, fields.end.type);
  return patch;
};

/* the patch a RESIZE writes: the end field only, clamped so the stored span can
   never end before it starts */
export const patchForResize = (
  ev: { startStr: string; endStr: string; allDay: boolean },
  fields: CalendarFields,
): Record<string, unknown> => {
  if (!fields.end) return {};
  if (ev.allDay) {
    const start = ev.startStr.slice(0, 10);
    const end = eventEndToSpan(ev.endStr.slice(0, 10));
    return { [fields.end.key]: end < start ? start : end };
  }
  return { [fields.end.key]: Date.parse(ev.endStr) < Date.parse(ev.startStr) ? ev.startStr : ev.endStr };
};

/* the draft an empty-day click seeds the create dialog with */
export const createPrefill = (dateStr: string, start: FieldDef): Record<string, unknown> => ({
  [start.key]: start.type === "date" ? dateStr.slice(0, 10) : dateStr,
});

/* the draft a drag-SELECT (range) seeds the create dialog with — start + end. FC
   reports the range end EXCLUSIVE for all-day selects (a 3-day pick ends on the
   4th), so an all-day end field converts back to the inclusive stored span; the
   start reuses the same field-shape rule as a drop. */
export const rangePrefill = (
  startStr: string,
  endStr: string,
  fields: CalendarFields,
  allDay: boolean,
): Record<string, unknown> => {
  const prefill: Record<string, unknown> = {
    [fields.start.key]: dropStart(startStr, allDay, fields.start.type),
  };
  if (fields.end) prefill[fields.end.key] = dropEnd(endStr, allDay, fields.end.type);
  return prefill;
};

/* compose a FullCalendar rrule-plugin input from a stored RRULE string + the
   event's start. The stored field holds a bare rule ("FREQ=WEEKLY;BYDAY=MO"); the
   plugin needs a DTSTART, so we inject it from the start in the field's own
   representation — a date-only DTSTART for all-day, a compact instant for timed —
   dropping any DTSTART/RRULE prefixes the value may already carry (the start is
   authoritative). Returns null when the value has no FREQ (nothing to expand → the
   row renders as a single event). `duration` gives each timed occurrence its
   length. Render-only: this never edits the underlying rule. */
export const recurrenceInput = (
  start: string,
  allDay: boolean,
  rawRule: unknown,
  endIso?: string,
): { rrule: string; duration?: string } | null => {
  if (typeof rawRule !== "string" || !/FREQ=/i.test(rawRule)) return null;
  const up = rawRule.toUpperCase();
  const at = up.indexOf("RRULE:");
  const body = (at >= 0 ? rawRule.slice(at + 6) : rawRule).trim();
  const rrule = allDay
    ? `DTSTART;VALUE=DATE:${start.slice(0, 10).replace(/-/g, "")}\nRRULE:${body}`
    : `DTSTART:${start.replace(/\.\d+/, "").replace(/[-:]/g, "")}\nRRULE:${body}`;
  const out: { rrule: string; duration?: string } = { rrule };
  if (!allDay && endIso) {
    const ms = Date.parse(endIso) - Date.parse(start);
    if (ms > 0) {
      const mins = Math.round(ms / 60000);
      out.duration = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }
  }
  return out;
};

/* every day of the anchor's month, in order — the agenda list's row spine */
export const monthDays = (anchor: string): string[] => {
  const first = anchor.slice(0, 8) + "01";
  const days: string[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d);
  return days;
};

/* day → its events (all-day spans cover every day they touch; timed events land
   on their LOCAL start day), events within a day ordered all-day-first then by time */
export const eventsByDay = (events: CalEvent[], days: string[]): Map<string, CalEvent[]> => {
  const inMonth = new Set(days);
  const map = new Map<string, CalEvent[]>();
  const push = (day: string, ev: CalEvent) => {
    if (!inMonth.has(day)) return;
    const list = map.get(day);
    if (list) list.push(ev);
    else map.set(day, [ev]);
  };
  for (const ev of events) {
    if (ev.allDay) {
      const last = ev.end ? eventEndToSpan(ev.end) : ev.start;
      for (let d = ev.start; d <= last; d = addDays(d, 1)) push(d, ev);
    } else {
      push(localDay(new Date(ev.start)), ev);
    }
  }
  for (const list of map.values())
    list.sort((a, b) => Number(a.allDay ? 0 : Date.parse(a.start)) - Number(b.allDay ? 0 : Date.parse(b.start)));
  return map;
};
