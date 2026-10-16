import { GrowthRecord } from "@pedia/shared";
import type { GrowthRecord as GrowthRow, Prisma } from "../generated/prisma/client.ts";

/** A contract record as its row, for the seed. `clinicId` from the context. */
export const growthRow = (g: GrowthRecord) => ({
  id: g.id, patientId: g.patientId, visitId: g.visitId, habits: g.habits as Prisma.InputJsonArray,
  speech: g.speech ?? null, recordedAt: new Date(g.recordedAt),
});

export const GROWTH_COLUMNS = {
  id: true, clinicId: true, patientId: true, visitId: true, habits: true, speech: true, recordedAt: true,
} as const;

/** Oldest first, as the mock sorts (growth/mocks.ts:14); habitTimeline reads them in this order. */
export const GROWTH_ORDER = [{ recordedAt: "asc" }, { id: "asc" }] as const;

/** The stored record as the contract's. Parsed: the habit refines run again, and they hold for any stored date. */
export const toGrowth = (r: Pick<GrowthRow, keyof typeof GROWTH_COLUMNS>): GrowthRecord =>
  GrowthRecord.parse({
    id: r.id, clinicId: r.clinicId, patientId: r.patientId, visitId: r.visitId, habits: r.habits,
    ...(r.speech !== null && { speech: r.speech }), recordedAt: r.recordedAt.toISOString(),
  });
