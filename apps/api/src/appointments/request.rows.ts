import type { AppointmentRequest } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

export const REQUEST_COLUMNS = {
  id: true, clinicId: true, patientId: true, guardianId: true, preferredDate: true, timeOfDay: true, reason: true,
  note: true, status: true, createdAt: true,
} as const satisfies Prisma.AppointmentRequestSelect;
export type RequestRow = Prisma.AppointmentRequestGetPayload<{ select: typeof REQUEST_COLUMNS }>;
/** Newest first (the mock's sort); a tie by id, so the seed staggers its times (Step 3.1). */
export const REQUEST_ORDER = [{ createdAt: "desc" }, { id: "desc" }] as const satisfies Prisma.AppointmentRequestOrderByWithRelationInput[];

export const toRequest = (r: RequestRow): AppointmentRequest => ({
  id: r.id, clinicId: r.clinicId, patientId: r.patientId, guardianId: r.guardianId,
  preferredDate: r.preferredDate.toISOString().slice(0, 10), timeOfDay: r.timeOfDay, reason: r.reason,
  ...(r.note !== null && { note: r.note }), status: r.status, createdAt: r.createdAt.toISOString(),
});

export const requestData = (q: AppointmentRequest) => ({
  id: q.id, clinicId: q.clinicId, patientId: q.patientId, guardianId: q.guardianId,
  preferredDate: new Date(`${q.preferredDate}T00:00:00.000Z`), timeOfDay: q.timeOfDay, reason: q.reason,
  note: q.note ?? null, status: q.status, createdAt: new Date(q.createdAt),
});
