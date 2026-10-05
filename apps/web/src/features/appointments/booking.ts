import { format, isSameDay, isTomorrow } from "date-fns";
import { formatPeso, type Procedure } from "@pedia/shared";

/** Shown as chips first; "More" shows the rest. Data, so the clinic can reorder it. */
export const COMMON_PROCEDURES: readonly string[] = ["oral_exam", "prophylaxis", "fluoride", "restoration", "follow_up"];

/** "30 min · ₱1,200.00", or "· ₱2,000.00 per tooth". Money through formatPeso only. */
export const procedureHint = (p: Procedure) => `${p.defaultDurationMin} min · ${formatPeso(p.fee)}${p.perTooth ? " per tooth" : ""}`;

/** When, in words: "today, 2:45 PM", "tomorrow, 9:00 AM", "Wed, Oct 7, 9:00 AM". */
export function whenLabel(start: Date, now = new Date()): string {
  const day = isSameDay(start, now) ? "today" : isTomorrow(start) ? "tomorrow" : format(start, "EEE, MMM d");
  return `${day}, ${format(start, "h:mm a")}`;
}

/** The primary button says what will happen: "Book today, 2:45 PM". */
export const bookLabel = (start: Date, now = new Date()) => `Book ${whenLabel(start, now)}`;

/** Patients with a booking in the window first (soonest first), then everyone else by surname. */
export function rankPatients<T extends { id: string; lastName: string; firstName: string }>(patients: T[], bookedIds: string[]): T[] {
  const rank = (id: string) => {
    const i = bookedIds.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  return [...patients].sort((a, b) => rank(a.id) - rank(b.id) || `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
}

export const slotKey = (s: { startsAt: Date; chairId: string }) => `${s.startsAt.toISOString()}|${s.chairId}`;
