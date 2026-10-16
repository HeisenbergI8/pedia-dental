import { deriveChart, isToothGone, surfacesFor, type ChartEntry, type CreateChartBatchInput, type CreateChartEntryInput, type Visit } from "@pedia/shared";

/** A refusal: the status and the mock's plain-text words (chart/mocks.ts). */
export type Refusal = { status: 400 | 404 | 409; message: string };

export const VISIT_NOT_FOUND = "Visit not found for this patient";
export const NOT_IN_PROGRESS = "Findings can only be recorded during a visit in progress";

/** The visit checks both handlers start with (chart/mocks.ts). */
function visitRefusal(visit: Pick<Visit, "status"> | undefined): Refusal | undefined {
  if (!visit) return { status: 404, message: VISIT_NOT_FOUND };
  if (visit.status !== "in_progress") return { status: 409, message: NOT_IN_PROGRESS };
  return undefined;
}

/**
 * POST /patients/:id/chart after the body parsed: the mock's checks, same order and words. `entries` are this patient's.
 * Rules as a pure function (not inline in the service): two handlers share them, and each branch is a unit test.
 */
export function entryRefusal(input: CreateChartEntryInput, visit: Pick<Visit, "status"> | undefined, entries: ChartEntry[]): Refusal | undefined {
  const refused = visitRefusal(visit);
  if (refused) return refused;
  if (!input.surfaces.every((s) => surfacesFor(input.tooth).includes(s))) {
    return { status: 400, message: `Tooth ${input.tooth} has no such surface` };
  }
  if (!input.supersedes && isToothGone(deriveChart(entries).get(input.tooth))) {
    return { status: 409, message: `Tooth ${input.tooth} is recorded as extracted or missing. Correct that entry instead` };
  }
  if (input.supersedes) {
    const original = entries.find((e) => e.id === input.supersedes);
    if (!original || original.tooth !== input.tooth) return { status: 400, message: "A correction must replace an entry on the same tooth" };
    if (entries.some((e) => e.supersedes === original.id)) return { status: 409, message: "That entry has already been corrected" };
  }
  return undefined;
}

/** POST /patients/:id/chart/batch after the body parsed: the mock's checks. Common surfaces are the schema's refine. */
export function batchRefusal(input: CreateChartBatchInput, visit: Pick<Visit, "status"> | undefined, entries: ChartEntry[]): Refusal | undefined {
  const refused = visitRefusal(visit);
  if (refused) return refused;
  const chart = deriveChart(entries);
  const gone = input.teeth.filter((t) => isToothGone(chart.get(t)));
  if (gone.length) {
    return { status: 409, message: `Tooth ${gone.join(", ")} is recorded as extracted or missing. Unpick it, or correct that entry` };
  }
  return undefined;
}
