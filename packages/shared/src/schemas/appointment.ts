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
  /** Set when this appointment was created from a follow-up or recall rule. */
  sourceRuleId: Id.optional(),
});
export type Appointment = z.infer<typeof Appointment>;
