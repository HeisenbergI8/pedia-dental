import type { Appointment } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** The contract's columns: every Appointment read selects exactly these (CONVENTIONS → Data). */
export const APPOINTMENT_COLUMNS = {
  id: true, clinicId: true, branchId: true, patientId: true, dentistId: true, chairId: true, startsAt: true,
  durationMin: true, reason: true, procedureCode: true, status: true, cancelReason: true, sourceRuleId: true,
} as const satisfies Prisma.AppointmentSelect;
export type AppointmentRow = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_COLUMNS }>;

/** Calendar order: by start, then chair order (decision 5), then id. `chairOrder` is chair id → position. */
export const byStartThenChair = (chairOrder: ReadonlyMap<string, number>) => (a: Appointment, b: Appointment) =>
  a.startsAt.localeCompare(b.startsAt) || (chairOrder.get(a.chairId) ?? 0) - (chairOrder.get(b.chairId) ?? 0) || a.id.localeCompare(b.id);

export const toAppointment = (r: AppointmentRow): Appointment => ({
  id: r.id, clinicId: r.clinicId, branchId: r.branchId, patientId: r.patientId, dentistId: r.dentistId, chairId: r.chairId,
  startsAt: r.startsAt.toISOString(), durationMin: r.durationMin, reason: r.reason, status: r.status,
  ...(r.procedureCode && { procedureCode: r.procedureCode }),
  ...(r.cancelReason && { cancelReason: r.cancelReason }),
  ...(r.sourceRuleId && { sourceRuleId: r.sourceRuleId }),
});

/** The seed's appointment as a row (clinicId comes from the caller's clinicData() / the seed's clinic). */
export const appointmentData = (a: Appointment) => ({
  id: a.id, clinicId: a.clinicId, branchId: a.branchId, patientId: a.patientId, dentistId: a.dentistId, chairId: a.chairId,
  startsAt: new Date(a.startsAt), durationMin: a.durationMin, reason: a.reason, procedureCode: a.procedureCode ?? null,
  status: a.status, cancelReason: a.cancelReason ?? null, sourceRuleId: a.sourceRuleId ?? null,
});
