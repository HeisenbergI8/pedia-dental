import { addYears, format } from "date-fns";
import {
  DEFAULT_FOLLOW_UP_RULES, canReschedule, canTransition, findConflict, holdsRole, outsideClinicHours, requestDayClosed, worksAt,
  type Appointment, type AppointmentStatus, type Branch, type Chair, type ChangeAppointmentStatusInput, type OpeningHours, type StaffMember,
} from "@pedia/shared";
import type { Refusal } from "../common/refusal";

export const APPOINTMENT_NOT_FOUND = "Appointment not found"; // appointments/mocks.ts:99, 117; visits/mocks.ts:35
export const REQUEST_NOT_FOUND = "Request not found"; // mocks.ts:179

type Slot = Pick<Appointment, "id" | "branchId" | "dentistId" | "chairId" | "startsAt" | "durationMin" | "status">;
/** The clinic's reference data and the live appointments near the slot, read under the clinic lock (E1). */
export type SlotRefs = {
  staff: Pick<StaffMember, "id" | "fullName" | "role" | "alsoRoles" | "isOwner" | "branchIds" | "deactivatedAt">[];
  branches: Branch[];
  chairs: Pick<Chair, "id" | "branchId" | "name">[];
  existing: Slot[];
};

/** rejectSlot, in its order. Undefined when the slot is free. The time is "h:mm a" in Manila (E3). */
export function slotRefusal(slot: Slot, refs: SlotRefs): Refusal | undefined {
  const dentist = refs.staff.find((s) => s.id === slot.dentistId && holdsRole(s, "dentist"));
  if (!dentist) return { status: 400, message: "Unknown dentist" };
  const branch = refs.branches.find((b) => b.id === slot.branchId);
  if (!branch || branch.archived) return { status: 400, message: "This branch isn't taking bookings" };
  if (!worksAt(dentist, branch)) return { status: 400, message: `${dentist.fullName} doesn't work at this branch` };
  if (!refs.chairs.some((c) => c.id === slot.chairId && c.branchId === slot.branchId)) {
    return { status: 400, message: "Choose a chair at this branch" };
  }
  const closed = outsideClinicHours(slot.startsAt, slot.durationMin, branch.openingHours);
  if (closed) return { status: 400, message: closed };
  const conflict = findConflict(slot, refs.existing);
  if (!conflict) return undefined;
  const who = conflict.on === "chair"
    ? refs.chairs.find((c) => c.id === conflict.appointment.chairId)?.name
    : refs.staff.find((s) => s.id === conflict.appointment.dentistId)?.fullName;
  return { status: 409, message: `${who} is already booked at ${format(new Date(conflict.appointment.startsAt), "h:mm a")}` };
}

/**
 * How far ahead a booking may go: long enough for the int tests' dates far from the seeded fortnight (2030–2031),
 * short enough to stop a typo like 9999 (#6). The web's booking.ts keeps the same number.
 */
export const BOOKING_HORIZON_YEARS = 5;
export const PAST_START = "That time has already passed. Pick a later time.";
export const TOO_FAR_AHEAD = `Book no more than ${BOOKING_HORIZON_YEARS} years ahead.`;

/** A new or moved start: not before now, not past the horizon (#6). `now` is Clock.now(). */
export function whenRefusal(startsAt: string, now: Date): Refusal | undefined {
  const at = new Date(startsAt);
  if (at < now) return { status: 400, message: PAST_START };
  if (at > addYears(now, BOOKING_HORIZON_YEARS)) return { status: 400, message: TOO_FAR_AHEAD };
  return undefined;
}

/** A booking's procedure and follow-up rule must exist (#28). `procedureKnown`: ClinicService.procedure found the code. */
export function linkRefusal(input: { procedureCode?: string; sourceRuleId?: string }, procedureKnown: boolean): Refusal | undefined {
  if (input.procedureCode !== undefined && !procedureKnown) return { status: 400, message: "Unknown procedure" };
  if (input.sourceRuleId !== undefined && !DEFAULT_FOLLOW_UP_RULES.some((r) => r.id === input.sourceRuleId)) {
    return { status: 400, message: "Unknown follow-up rule" };
  }
  return undefined;
}

export const EARLY_NO_SHOW = "Wait until the appointment time to mark a no-show.";

/** PUT's 409 (mocks.ts:102–104), after the 404 and the body. */
export const moveRefusal = (status: AppointmentStatus): Refusal | undefined =>
  canReschedule(status) ? undefined : { status: 409, message: "Only booked or confirmed appointments can be moved" };

/**
 * The status route's 403 then 409s (mocks.ts:120–127). `manages`: the caller holds appointments.manage. A no-show only
 * from the start time on (#7): before it the child can still come, and the parent would be texted "we missed you".
 */
export function statusRefusal(
  current: Pick<Appointment, "status" | "startsAt">,
  input: ChangeAppointmentStatusInput,
  manages: boolean,
  now: Date,
): Refusal | undefined {
  const from = current.status;
  if (input.status !== "confirmed" && !manages) {
    return { status: 403, message: "You can confirm this appointment. To change it, call the clinic." };
  }
  if (!canTransition(from, input.status)) return { status: 409, message: `Can't go from ${from} to ${input.status}` };
  if (input.status === "no_show" && now < new Date(current.startsAt)) return { status: 409, message: EARLY_NO_SHOW };
  return undefined;
}

/**
 * The request route's 400s then 409 (appointments/mocks.ts), after the 404 and the body. `today` is Clock.today();
 * `hours` each active branch's (issue 13: a weekday none of them opens is refused).
 */
export function requestRefusal(preferredDate: string, today: string, hasPending: boolean, hours: OpeningHours[]): Refusal | undefined {
  if (preferredDate < today) return { status: 400, message: "Pick today or a later date" };
  const closed = requestDayClosed(preferredDate, hours);
  if (closed) return { status: 400, message: closed };
  if (hasPending) return { status: 409, message: "You already have a request waiting. The clinic will call you to book it." };
  return undefined;
}

/** Live appointments that can clash with a slot (findConflict skips the rest): the conflict query's statuses. */
export const LIVE: AppointmentStatus[] = ["booked", "confirmed", "arrived", "in_chair", "done"];
