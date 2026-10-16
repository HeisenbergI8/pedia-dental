import type { DueItem } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** The contract's columns plus visitId (E6), which toDueItem drops. */
export const DUE_COLUMNS = {
  id: true, clinicId: true, patientId: true, ruleId: true, kind: true, procedure: true, dueOn: true, sourceNoteId: true,
  visitId: true, appointmentId: true, closedAt: true, createdAt: true,
} as const satisfies Prisma.DueItemSelect;
export type DueRow = Prisma.DueItemGetPayload<{ select: typeof DUE_COLUMNS }>;
/** Soonest first; same day by creation, then id (the mock keeps insertion order; Follow Up 4). */
export const DUE_ORDER = [{ dueOn: "asc" }, { createdAt: "asc" }, { id: "asc" }] as const satisfies Prisma.DueItemOrderByWithRelationInput[];

export const toDueItem = (r: DueRow, dentistId?: string): DueItem => ({
  id: r.id, clinicId: r.clinicId, patientId: r.patientId, ruleId: r.ruleId, kind: r.kind, procedure: r.procedure,
  dueOn: r.dueOn.toISOString().slice(0, 10), sourceNoteId: r.sourceNoteId, createdAt: r.createdAt.toISOString(),
  ...(r.appointmentId && { appointmentId: r.appointmentId }),
  ...(r.closedAt && { closedAt: r.closedAt.toISOString() }),
  ...(dentistId && { dentistId }),
});

/** The seed's item as a row: `visitId` is the source note's visit (the seed knows it). */
export const dueItemData = (i: DueItem, visitId: string) => ({
  id: i.id, clinicId: i.clinicId, patientId: i.patientId, ruleId: i.ruleId, kind: i.kind, procedure: i.procedure,
  dueOn: new Date(`${i.dueOn}T00:00:00.000Z`), sourceNoteId: i.sourceNoteId, visitId, appointmentId: i.appointmentId ?? null,
  closedAt: i.closedAt ? new Date(i.closedAt) : null, createdAt: new Date(i.createdAt),
});
