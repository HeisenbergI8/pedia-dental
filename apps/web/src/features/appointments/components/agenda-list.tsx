import { format, isSameDay } from "date-fns";
import { isClosedDay, type Appointment } from "@pedia/shared";
import { StatusChip } from "./status-chip";

export type AgendaItem = { appointment: Appointment; title: string; start: Date; end: Date; chairName: string };

/**
 * Appointments as a list, one group per day: the phone layout for Day and Week, and the List view
 * everywhere. Readable at 360px, keyboard- and screen-reader-friendly where the calendar grid isn't.
 */
/** `counts`: every live appointment per day, unfiltered, so a filtered-empty day is never called closed. */
export function AgendaList({
  items,
  days,
  onOpen,
  counts,
}: {
  items: AgendaItem[];
  days: Date[];
  onOpen: (id: string) => void;
  counts?: Map<string, number>;
}) {
  return (
    <div className="space-y-5">
      {days.map((day) => {
        const today = items.filter((i) => isSameDay(i.start, day)).sort((a, b) => a.start.getTime() - b.start.getTime());
        return (
          <section key={day.toISOString()} aria-labelledby={`day-${day.toISOString()}`} className="space-y-2">
            {days.length > 1 && (
              <h2 id={`day-${day.toISOString()}`} className="flex items-baseline justify-between text-lg font-semibold">
                {format(day, "EEEE, MMM d")}
                <span className="text-sm font-normal text-ink-muted">
                  {today.length === 0 ? "None" : `${today.length} appointment${today.length === 1 ? "" : "s"}`}
                </span>
              </h2>
            )}
            {today.length === 0 ? (
              <p className="rounded-2xl bg-surface px-4 py-5 text-sm text-ink-muted ring-1 ring-line">
                {isClosedDay(day, counts?.get(format(day, "yyyy-MM-dd")) ?? today.length) ? "The clinic is closed." : "No appointments."}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                {today.map((i) => (
                  <li key={i.appointment.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(i.appointment.id)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-(--duration-fast) hover:bg-selected focus-visible:bg-selected focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                    >
                      <span className="w-22 shrink-0 text-sm whitespace-nowrap tabular-nums">
                        <span className="block font-semibold">{format(i.start, "h:mm a")}</span>
                        <span className="block text-ink-muted">{format(i.end, "h:mm a")}</span>
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          {/* No strikethrough: the status chip beside it says "No-show". */}
                          <span className={i.appointment.status === "no_show" ? "font-semibold text-ink-muted" : "font-semibold"}>{i.title}</span>
                          <StatusChip status={i.appointment.status} />
                        </span>
                        <span className="block text-sm text-ink-muted">
                          {i.appointment.reason} · {i.chairName}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
