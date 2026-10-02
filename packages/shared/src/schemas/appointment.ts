import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";

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

export const Appointment = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  dentistId: Id,
  chairId: Id,
  startsAt: IsoDateTime,
  durationMin: z.number().int().positive(),
  reason: z.string(),
  status: AppointmentStatus,
  cancelReason: z.string().optional(),
  /** Set when this appointment was created from a follow-up or recall rule. */
  sourceRuleId: Id.optional(),
});
export type Appointment = z.infer<typeof Appointment>;

export const BookAppointmentInput = Appointment.pick({
  patientId: true,
  dentistId: true,
  chairId: true,
  startsAt: true,
  durationMin: true,
  reason: true,
  sourceRuleId: true,
});
export type BookAppointmentInput = z.infer<typeof BookAppointmentInput>;

/** Moving an appointment: new time, length, chair or dentist. The patient never changes. */
export const RescheduleAppointmentInput = BookAppointmentInput.omit({ patientId: true, sourceRuleId: true });
export type RescheduleAppointmentInput = z.infer<typeof RescheduleAppointmentInput>;

/**
 * Status changes staff make by hand. `in_chair` and `done` are set by starting
 * and finishing the linked visit instead.
 */
export const ChangeAppointmentStatusInput = z.discriminatedUnion("status", [
  z.object({ status: z.enum(["confirmed", "arrived", "no_show"]) }),
  z.object({ status: z.literal("cancelled"), cancelReason: z.string().trim().min(1, "Give a reason") }),
]);
export type ChangeAppointmentStatusInput = z.infer<typeof ChangeAppointmentStatusInput>;
