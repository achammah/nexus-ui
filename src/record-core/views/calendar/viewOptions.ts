/* Pure config → FullCalendar option mapping for the calendar view — no
   FullCalendar, no React, no browser: unit-testable under node:test. CalendarView
   spreads the resolved options onto the <FullCalendar> element and reads the view
   helpers for its picker. Config is the single source for every option, and the
   mapping is the thing under test.

   Two vocabularies meet here: the CONFIG-facing view names (business-language:
   month · week · day · listWeek · listMonth · year) and FullCalendar's own view
   TYPES (dayGridMonth · timeGridWeek · …). fcViewType() bridges them, and it needs
   the object's all-day-ness: an all-day `date` object takes the day-grid week/day,
   a timed `dateTime` object takes the hourly time-grid. */

/* the config-facing calendar views the picker offers */
export type CalViewName = "month" | "week" | "day" | "listWeek" | "listMonth" | "year";
export const ALL_VIEWS: CalViewName[] = ["month", "week", "day", "listWeek", "listMonth", "year"];

/* picker labels (business-language, never FC's raw view types) */
export const VIEW_LABELS: Record<CalViewName, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  listWeek: "List week",
  listMonth: "List month",
  year: "Year",
};

/* weekday names for the firstDay select (index = FC's day number 0..6) */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* slotDuration select values → FC duration strings */
const SLOT_MAP: Record<string, string> = { "15m": "00:15:00", "30m": "00:30:00", "60m": "01:00:00" };
export const SLOT_VALUES = Object.keys(SLOT_MAP);

const isView = (v: unknown): v is CalViewName => typeof v === "string" && (ALL_VIEWS as string[]).includes(v);
const parseBool = (v: unknown, dflt: boolean): boolean => (typeof v === "boolean" ? v : dflt);

/* the config's enabled view set — a multiSelect array, filtered to valid views,
   order-preserving, de-duplicated; empty/absent → all six */
export const enabledViews = (cfg: Record<string, unknown>): CalViewName[] => {
  const raw = cfg.enabledViews;
  if (!Array.isArray(raw)) return ALL_VIEWS;
  const seen = new Set<string>();
  const out = raw.filter((v): v is CalViewName => isView(v) && !seen.has(v) && (seen.add(v), true));
  return out.length ? out : ALL_VIEWS;
};

/* the initial view: the configured defaultView when it is enabled, else the first
   enabled view (never a view the picker doesn't offer) */
export const defaultView = (cfg: Record<string, unknown>, enabled: CalViewName[] = enabledViews(cfg)): CalViewName => {
  const d = cfg.defaultView;
  return isView(d) && enabled.includes(d) ? d : enabled[0] ?? "month";
};

/* config view name → FullCalendar view type, resolving week/day against all-day-ness */
export const fcViewType = (view: CalViewName, allDay: boolean): string => {
  switch (view) {
    case "month": return "dayGridMonth";
    case "week": return allDay ? "dayGridWeek" : "timeGridWeek";
    case "day": return allDay ? "dayGridDay" : "timeGridDay";
    case "listWeek": return "listWeek";
    case "listMonth": return "listMonth";
    case "year": return "multiMonthYear";
  }
};

/* "HH:MM" (or "HH:MM:SS") → FC's "HH:MM:SS"; anything malformed → the fallback */
const parseTime = (v: unknown, fallback: string): string => {
  if (typeof v !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  if (h > 24) return fallback;
  return `${String(h).padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}`;
};

/* the resolved FullCalendar options bundle (spread onto <FullCalendar>) */
export interface CalFcOptions {
  firstDay: number;
  slotDuration: string;
  slotMinTime: string;
  slotMaxTime: string;
  weekNumbers: boolean;
  businessHours: boolean | { daysOfWeek: number[]; startTime: string; endTime: string };
  nowIndicator: boolean;
  eventOverlap: boolean;
}

/* whether the config permits editing / range-selection (BEFORE the permission AND
   — CalendarView combines these with readOnly / create rights) */
export const configEditable = (cfg: Record<string, unknown>): boolean => parseBool(cfg.editable, true);
export const configSelectable = (cfg: Record<string, unknown>): boolean => parseBool(cfg.selectable, true);

export const viewOptions = (cfg: Record<string, unknown>): CalFcOptions => {
  const dayIdx = WEEKDAYS.indexOf(typeof cfg.firstDay === "string" ? cfg.firstDay : "");
  return {
    firstDay: dayIdx >= 0 ? dayIdx : 1, // default Monday
    slotDuration: SLOT_MAP[typeof cfg.slotDuration === "string" ? cfg.slotDuration : ""] ?? "00:30:00",
    slotMinTime: parseTime(cfg.slotMinTime, "00:00:00"),
    slotMaxTime: parseTime(cfg.slotMaxTime, "24:00:00"),
    weekNumbers: parseBool(cfg.weekNumbers, false),
    businessHours: parseBool(cfg.businessHours, false)
      ? { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" }
      : false,
    nowIndicator: parseBool(cfg.nowIndicator, true),
    eventOverlap: parseBool(cfg.eventOverlap, true),
  };
};
