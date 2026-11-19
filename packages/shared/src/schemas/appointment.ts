import { z } from "zod";
import { BranchScoped, ClinicScoped, Id, IsoDateTime, addDaysTo, isoDate, manilaToday, tooLong } from "./common";

export const AppointmentStatus = z.enum([
  "booked",
  "confirmed",
  "arrived",
  "in_chair",
  "done",
  "no_show",
  "cancelled",
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatus>;

/** Branch-owned (decision #16): it happens at one branch, in one of that branch's chairs. */
export const Appointment = BranchScoped.extend({
  id: Id,
  patientId: Id,
  dentistId: Id,
  chairId: Id,
  startsAt: IsoDateTime,
  durationMin: z.number().int().positive(),
  reason: z.string(),
  /** The Procedure.code this visit is for, as a real field (the reason is the readable wording). Optional for older rows. */
  procedureCode: z.string().optional(),
  status: AppointmentStatus,
  cancelReason: z.string().optional(),
  /** Set when this appointment was created from a follow-up or recall rule. */
  sourceRuleId: Id.optional(),
});
export type Appointment = z.infer<typeof Appointment>;

/** The longest reason typed for a visit or a cancellation (issue 5): a sensible length, well inside the column. */
export const APPOINTMENT_REASON_MAX = 500;
const ReasonText = z.string().max(APPOINTMENT_REASON_MAX, tooLong(APPOINTMENT_REASON_MAX, "the reason"));

export const BookAppointmentInput = Appointment.pick({
  patientId: true,
  dentistId: true,
  chairId: true,
  startsAt: true,
  durationMin: true,
  reason: true,
  procedureCode: true,
  sourceRuleId: true,
}).extend({ reason: ReasonText });
export type BookAppointmentInput = z.infer<typeof BookAppointmentInput>;

/** Moving an appointment: new time, length, chair or dentist. The patient never changes. */
export const RescheduleAppointmentInput = BookAppointmentInput.omit({ patientId: true, sourceRuleId: true, procedureCode: true });
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentInput>;

/**
 * Status changes staff make by hand. `in_chair` and `done` are set by starting
 * and finishing the linked visit instead.
 */
export const ChangeAppointmentStatusInput = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["confirmed", "arrived", "no_show"]) }),
  z.object({ status: z.literal("cancelled"), cancelReason: ReasonText.trim().min(1, "Give a reason") }),
]);
export type ChangeAppointmentStatusInput = z.infer<typeof ChangeAppointmentStatusInput>;

export const TimeOfDay = z.enum(["morning", "afternoon", "any"]);
export type TimeOfDay = z.infer<typeof TimeOfDay>;

/** `handled`: staff booked it or called the parent back. Nothing else happens to a request. */
export const AppointmentRequestStatus = z.enum(["pending", "handled"]);
export type AppointmentRequestStatus = z.infer<typeof AppointmentRequestStatus>;

/** A parent's request from the portal. It isn't an appointment: staff pick the slot and book it. */
export const AppointmentRequest = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  guardianId: Id,
  preferredDate: isoDate("Pick a date"),
  timeOfDay: TimeOfDay,
  reason: z.string().trim().min(1, "Say what the visit is for").max(200, tooLong(200, "it")),
  note: z.string().trim().max(500, tooLong(500, "it")).optional(),
  status: AppointmentRequestStatus,
  createdAt: IsoDateTime,
});
export type AppointmentRequest = z.infer<typeof AppointmentRequest>;

/** How far ahead a parent may ask for a day (issue 13): about a year. Whether the branch is open that day is the API's. */
export const REQUEST_DAYS_AHEAD = 365;

export const CreateAppointmentRequestInput = AppointmentRequest.pick({
  preferredDate: true,
  timeOfDay: true,
  reason: true,
  note: true,
}).extend({
  // Inputs only: a request stored before this check is still read.
  preferredDate: isoDate("Pick a date")
    .refine((d) => d <= addDaysTo(manilaToday(), REQUEST_DAYS_AHEAD), "Pick a date within the next year"),
});
export type CreateAppointmentRequestInput = z.infer<typeof CreateAppointmentRequestInput>;
