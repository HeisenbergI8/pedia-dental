import { ChartEntry } from "@pedia/shared";
import type { ChartEntry as ChartEntryRow } from "../generated/prisma/client.ts";

/** A contract entry as its row, for the seed. `clinicId` from the context. */
export const chartEntryRow = (e: ChartEntry) => ({
  id: e.id, patientId: e.patientId, visitId: e.visitId, tooth: e.tooth, surfaces: e.surfaces, condition: e.condition,
  note: e.note ?? null, recordedBy: e.recordedBy, recordedAt: new Date(e.recordedAt), supersedes: e.supersedes ?? null,
});

export const CHART_COLUMNS = {
  id: true, clinicId: true, patientId: true, visitId: true, tooth: true, surfaces: true, condition: true, note: true,
  recordedBy: true, recordedAt: true, supersedes: true,
} as const;

/** Oldest first, as the mock sorts (chart/mocks.ts). `id` breaks a tie so the order is stable between reads. */
export const CHART_ORDER = [{ recordedAt: "asc" }, { id: "asc" }] as const;

/** The stored entry as the contract's, parsed: a tooth outside ALL_TEETH or an unknown surface fails here. */
export const toChartEntry = (r: Pick<ChartEntryRow, keyof typeof CHART_COLUMNS>): ChartEntry =>
  ChartEntry.parse({
    id: r.id, clinicId: r.clinicId, patientId: r.patientId, visitId: r.visitId, tooth: r.tooth, surfaces: r.surfaces,
    condition: r.condition, ...(r.note !== null && { note: r.note }), recordedBy: r.recordedBy,
    recordedAt: r.recordedAt.toISOString(), ...(r.supersedes && { supersedes: r.supersedes }),
  });
