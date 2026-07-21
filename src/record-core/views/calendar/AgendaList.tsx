import * as React from "react";
import { Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { CalEvent } from "./events";
import { eventsByDay, localDay, monthDays } from "./events";

/* Mobile agenda — the calendar's ≤768px render path: a structurally different
   day list, never a squeezed month grid. Every day of the anchor month is a row
   (tap a day = create on that day), events nest under their day (tap = peek).
   Virtualized (@tanstack/react-virtual) so a 10k-row object scrolls flat. */

type Item =
  | { kind: "day"; day: string }
  | { kind: "event"; day: string; ev: CalEvent };

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function AgendaList({
  anchor,
  events,
  onOpen,
  onCreateDraft,
}: {
  /* first day of the visible month ("2026-08-01") */
  anchor: string;
  events: CalEvent[];
  onOpen: (id: string) => void;
  /* absent (no create right) → day rows are inert labels */
  onCreateDraft?: (day: string) => void;
}) {
  const items = React.useMemo<Item[]>(() => {
    const days = monthDays(anchor);
    const byDay = eventsByDay(events, days);
    const out: Item[] = [];
    for (const day of days) {
      out.push({ kind: "day", day });
      for (const ev of byDay.get(day) ?? []) out.push({ kind: "event", day, ev });
    }
    return out;
  }, [anchor, events]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i].kind === "day" ? 34 : 42),
    overscan: 16,
  });

  // land on today when the anchor month is the current one
  const today = localDay(new Date());
  React.useEffect(() => {
    const idx = items.findIndex((it) => it.kind === "day" && it.day === today);
    if (idx > 0) virtualizer.scrollToIndex(idx, { align: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const dayLabel = (day: string) => {
    const d = new Date(day + "T00:00:00");
    return `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()}`;
  };

  return (
    <div className="nxCalAgenda" ref={scrollRef} data-testid="calendar-agenda">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          const style: React.CSSProperties = {
            position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)`,
          };
          if (item.kind === "day")
            return (
              <button
                key={vi.key}
                type="button"
                style={style}
                className="nxCalAgendaDay"
                data-testid={`agenda-day-${item.day}`}
                data-today={item.day === today ? "true" : undefined}
                data-creatable={onCreateDraft ? "true" : undefined}
                aria-label={onCreateDraft ? `Add on ${item.day}` : item.day}
                disabled={!onCreateDraft}
                onClick={() => onCreateDraft?.(item.day)}
              >
                {dayLabel(item.day)}
                {onCreateDraft && (
                  <span className="nxCalAgendaAdd" data-testid={`agenda-create-${item.day}`}>
                    <Plus size={13} />
                  </span>
                )}
              </button>
            );
          const { ev } = item;
          return (
            <button
              key={vi.key}
              type="button"
              style={style}
              className="nxCalAgendaEvent"
              data-testid={`calendar-event-${ev.id}`}
              data-color={ev.color ?? "none"}
              onClick={() => onOpen(ev.id)}
            >
              <span
                className="nxCalAgendaDot"
                style={{ background: ev.color ? `var(--nx-opt-${ev.color})` : "var(--nx-accent)" }}
              />
              {!ev.allDay && <span className="nxCalAgendaTime">{timeFmt.format(new Date(ev.start))}</span>}
              <span className="nxCalAgendaTitle">{ev.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
