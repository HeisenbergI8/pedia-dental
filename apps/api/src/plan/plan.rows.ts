import { PlanItem } from "@pedia/shared";
import type { PlanItem as PlanItemRow } from "../generated/prisma/client.ts";

/** A contract item as its row, for the seed. `clinicId` from the context. */
export const planItemRow = (i: PlanItem) => ({
  id: i.id, patientId: i.patientId, procedureCode: i.procedureCode, tooth: i.tooth ?? null, fee: i.fee, status: i.status,
  sourceChartEntryId: i.sourceChartEntryId ?? null, completedVisitId: i.completedVisitId ?? null,
  completedNoteId: i.completedNoteId ?? null, createdAt: new Date(i.createdAt),
});

export const PLAN_COLUMNS = {
  id: true, clinicId: true, patientId: true, procedureCode: true, tooth: true, fee: true, status: true,
  sourceChartEntryId: true, completedVisitId: true, completedNoteId: true, createdAt: true,
} as const;

/** Oldest first, in the order the plan was written (plan/mocks.ts:14, plan/api.ts:21). */
export const PLAN_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

/** The stored item as the contract's. Absent stays absent (the web's `i.tooth === undefined` matters). */
export const toPlanItem = (r: Pick<PlanItemRow, keyof typeof PLAN_COLUMNS>): PlanItem =>
  PlanItem.parse({
    id: r.id, clinicId: r.clinicId, patientId: r.patientId, procedureCode: r.procedureCode,
    ...(r.tooth !== null && { tooth: r.tooth }), fee: r.fee, status: r.status,
    ...(r.sourceChartEntryId && { sourceChartEntryId: r.sourceChartEntryId }),
    ...(r.completedVisitId && { completedVisitId: r.completedVisitId }),
    ...(r.completedNoteId && { completedNoteId: r.completedNoteId }),
    createdAt: r.createdAt.toISOString(),
  });
