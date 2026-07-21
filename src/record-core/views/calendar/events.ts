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
}

/* engine-agnostic event — CalendarView maps this onto FullCalendar's EventInput */
export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  /* OptionColor name from the color field's own option palette */
  color?: string;
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
  const allDay = fields.start.type === "date";
  const events: CalEvent[] = [];
  for (const row of rows) {
    const rawStart = row[fields.start.key];
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
    if (fields.color && resolve.colorOf) ev.color = resolve.colorOf(fields.color, row[fields.color.key]);
    events.push(ev);
  }
  return { events, dated: events.length };
};

/* the patch a DROP writes: the start field always; the end field only when the
   dropped event still carries an end (FC moves both ends of a span together) */
export const patchForDrop = (
  ev: { startStr: string; endStr?: string | null; allDay: boolean },
  fields: CalendarFields,
): Record<string, unknown> => {
  const patch: Record<string, unknown> = {
    [fields.start.key]: ev.allDay ? ev.startStr.slice(0, 10) : ev.startStr,
  };
  if (fields.end && ev.endStr)
    patch[fields.end.key] = ev.allDay ? eventEndToSpan(ev.endStr.slice(0, 10)) : ev.endStr;
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
