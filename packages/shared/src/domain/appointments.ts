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

/** Only appointments that haven't started can be moved. */
export function canReschedule(status: AppointmentStatus): boolean {
  return status === "booked" || status === "confirmed";
}

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
