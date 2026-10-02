import { z } from "zod";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";

export const VisitStatus = z.enum(["in_progress", "completed"]);
export type VisitStatus = z.infer<typeof VisitStatus>;

/**
 * One sitting in the chair. Chart entries, notes, behavior, photos and payments
 * all attach to a visit. A patient has at most one visit in progress.
 */
export const Visit = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  dentistId: Id,
  appointmentId: Id.optional(), // set when started from an appointment (Chunk 10)
  date: IsoDate,
  status: VisitStatus,
  startedAt: IsoDateTime,
  completedAt: IsoDateTime.optional(),
});
export type Visit = z.infer<typeof Visit>;

export const StartVisitInput = Visit.pick({ dentistId: true, appointmentId: true });
export type StartVisitInput = z.infer<typeof StartVisitInput>;
