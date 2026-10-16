import { Visit } from "@pedia/shared";
import type { Visit as VisitRow } from "../generated/prisma/client.ts";

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A contract visit as its row, for the seed. `clinicId` comes from the context (the caller spreads it). */
export const visitRow = (v: Visit) => ({
  id: v.id, patientId: v.patientId, dentistId: v.dentistId, appointmentId: v.appointmentId ?? null,
  date: dateOnly(v.date), status: v.status, startedAt: new Date(v.startedAt),
  completedAt: v.completedAt ? new Date(v.completedAt) : null,
});

/** The columns toVisit reads: every select of a served visit uses this (CONVENTIONS → `select`). */
export const VISIT_COLUMNS = {
  id: true, clinicId: true, patientId: true, dentistId: true, appointmentId: true, date: true, status: true, startedAt: true, completedAt: true,
} as const;

/** The stored visit as the contract's. Parsed, so a bad row fails here, not in the browser. Absent stays absent. */
export const toVisit = (r: Pick<VisitRow, keyof typeof VISIT_COLUMNS>): Visit =>
  Visit.parse({
    id: r.id, clinicId: r.clinicId, patientId: r.patientId, dentistId: r.dentistId,
    ...(r.appointmentId && { appointmentId: r.appointmentId }),
    date: r.date.toISOString().slice(0, 10), status: r.status, startedAt: r.startedAt.toISOString(),
    ...(r.completedAt && { completedAt: r.completedAt.toISOString() }),
  });
