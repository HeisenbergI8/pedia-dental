"use client";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { isClosedDay } from "@pedia/shared";
import { cn } from "@/lib/utils";

/**
 * Month on a phone: one tappable day per cell with how many appointments it has. Tapping opens that day's list.
 * Counts come from countByDay (cancelled excluded), so they match the list it opens.
 */
export function MonthCountGrid({ month, counts, onPick }: { month: Date; counts: Map<string, number>; onPick: (day: Date) => void }) {
  const first = startOfWeek(startOfMonth(month));
  const last = endOfWeek(endOfMonth(month));
  const days: Date[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d);
  const today = new Date();

  return (
    <div className="rounded-xl border border-line bg-surface p-2 shadow-card">
      <div className="grid grid-cols-7 text-center text-xs font-medium text-ink-muted" aria-hidden>
        {days.slice(0, 7).map((d) => (
          <abbr key={d.toISOString()} title={format(d, "EEEE")} className="py-1 no-underline">{format(d, "EEEEE")}</abbr>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const n = counts.get(format(d, "yyyy-MM-dd")) ?? 0;
          const closed = isClosedDay(d, n);
          const label = `${format(d, "EEEE, MMMM d")}: ${closed ? "closed" : n === 0 ? "no appointments" : `${n} appointment${n === 1 ? "" : "s"}`}`;
          return (
            <li key={d.toISOString()}>
              <button
                type="button"
                aria-label={label}
                onClick={() => onPick(d)}
                className={cn(
                  "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-md text-sm tabular-nums",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none hover:bg-ground",
                  !isSameMonth(d, month) && "text-ink-muted/70",
                  closed && "text-ink-muted",
                  isSameDay(d, today) && "ring-1 ring-brand",
                )}
              >
                <span>{format(d, "d")}</span>
                {n > 0 ? (
                  <span className="min-w-5 rounded-full bg-brand px-1 text-xs font-semibold text-brand-ink">{n}</span>
                ) : (
                  <span className="h-4" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
