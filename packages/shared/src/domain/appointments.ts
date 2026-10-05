import { addDays, addMinutes, format, startOfDay } from "date-fns";
import type { Appointment, AppointmentStatus } from "../schemas/appointment";

/** booked → confirmed → arrived → in chair → done, or no-show / cancelled before arrival. */
const NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ["confirmed", "arrived", "no_show", "cancelled"],
  confirmed: ["arrived", "no_show", "cancelled"],
  arrived: ["in_chair", "cancelled"],
  in_chair: ["done"],
  done: [],
  no_show: [],
  cancelled: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return NEXT[from].includes(to);
}

/** Weekdays the clinic is closed, 0 = Sunday. Data, so a Saturday half-day or a second branch is a list change. */
export const CLOSED_WEEKDAYS: readonly number[] = [0];

/** Closed only when nothing is booked: a day with appointments is never shown as closed. */
export function isClosedDay(day: Date, appointmentCount: number): boolean {
  return appointmentCount === 0 && CLOSED_WEEKDAYS.includes(day.getDay());
}

/** Opening hours in minutes from local midnight. Data: a Saturday half-day becomes a per-weekday map here. */
export const CLINIC_HOURS = { opensAt: 8 * 60, closesAt: 18 * 60 } as const;

/** A weekday the clinic never opens, whatever is booked. The booking rule; `isClosedDay` is the display rule. */
export const isClosedWeekday = (day: Date) => CLOSED_WEEKDAYS.includes(day.getDay());

const clock = (min: number) => format(addMinutes(startOfDay(new Date(2000, 0, 1)), min), "h:mm a");

/** Why a booking can't go at this time, in staff words. Undefined when the clinic is open for all of it. */
export function outsideClinicHours(startsAt: string | Date, durationMin: number): string | undefined {
  const start = new Date(startsAt);
  if (isClosedWeekday(start)) return `The clinic is closed on ${format(start, "EEEE")}s. Pick another day.`;
  const from = start.getHours() * 60 + start.getMinutes();
  if (from < CLINIC_HOURS.opensAt || from + durationMin > CLINIC_HOURS.closesAt) {
    return `Book between ${clock(CLINIC_HOURS.opensAt)} and ${clock(CLINIC_HOURS.closesAt)}.`;
  }
  return undefined;
}

/** The first quarter-hour on or after `from` where `durationMin` fits clinic hours on an open day. */
export function nextOpenStart(from: Date, durationMin = 30): Date {
  let t = new Date(Math.ceil(from.getTime() / 900_000) * 900_000); // round up to :00/:15/:30/:45
  for (let i = 0; i < 14; i++) {
    const day = startOfDay(t);
    const opens = addMinutes(day, CLINIC_HOURS.opensAt);
    if (t < opens) t = opens;
    if (!outsideClinicHours(t, durationMin)) return t;
    t = addMinutes(addDays(day, 1), CLINIC_HOURS.opensAt); // closed or too late: next morning
  }
  return t;
}

/** Live appointments per local day ("2026-10-07" → 3). Cancelled ones don't count; no-shows do (they held the slot). */
export function countByDay(appointments: Pick<Appointment, "startsAt" | "status">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of appointments) {
    if (a.status === "cancelled") continue;
    const key = format(new Date(a.startsAt), "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Only appointments that haven't started can be moved. */
export function canReschedule(status: AppointmentStatus): boolean {
  return status === "booked" || status === "confirmed";
}

/** Today's counts and the calendar's ?status= filter: one map, so a count and its list always agree. */
export const STATUS_GROUPS = {
  upcoming: ["booked", "confirmed"],
  waiting: ["arrived"], // arrived, not yet in the chair
  in_chair: ["in_chair"],
  done: ["done"],
  missed: ["no_show", "cancelled"],
} as const satisfies Record<string, readonly AppointmentStatus[]>;
export type StatusGroup = keyof typeof STATUS_GROUPS;
export const isStatusGroup = (v: unknown): v is StatusGroup => typeof v === "string" && Object.hasOwn(STATUS_GROUPS, v);
export const inStatusGroup = (group: StatusGroup, status: AppointmentStatus) =>
  (STATUS_GROUPS[group] as readonly AppointmentStatus[]).includes(status);

type Slot = Pick<Appointment, "id" | "dentistId" | "chairId" | "startsAt" | "durationMin" | "status">;

const endOf = (a: Slot) => new Date(a.startsAt).getTime() + a.durationMin * 60_000;

/**
 * The first live appointment that would double-book `candidate`'s chair or
 * dentist. Cancelled and no-show appointments free their slot.
 */
export function findConflict(candidate: Slot, existing: Slot[]): { appointment: Slot; on: "chair" | "dentist" } | undefined {
  const start = new Date(candidate.startsAt).getTime();
  const end = endOf(candidate);
  for (const a of existing) {
    if (a.id === candidate.id || a.status === "cancelled" || a.status === "no_show") continue;
    if (new Date(a.startsAt).getTime() >= end || endOf(a) <= start) continue;
    if (a.chairId === candidate.chairId) return { appointment: a, on: "chair" };
    if (a.dentistId === candidate.dentistId) return { appointment: a, on: "dentist" };
  }
  return undefined;
}

/**
 * The first quarter-hour from `from`, in clinic hours on open days within `days`, where the dentist and one of the
 * chairs (in the order given) are free. Undefined when the window is full.
 */
export function findFreeSlot(
  { from, durationMin, dentistId, chairIds, days = 14 }: { from: Date; durationMin: number; dentistId: string; chairIds: string[]; days?: number },
  existing: Slot[],
): { startsAt: Date; chairId: string } | undefined {
  const until = addDays(startOfDay(from), days);
  for (let t = nextOpenStart(from, durationMin); t < until; t = nextOpenStart(addMinutes(t, 15), durationMin)) {
    for (const chairId of chairIds) {
      const candidate: Slot = { id: "", dentistId, chairId, startsAt: t.toISOString(), durationMin, status: "booked" };
      if (!findConflict(candidate, existing)) return { startsAt: t, chairId };
    }
  }
  return undefined;
}
