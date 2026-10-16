import type { ChartEntry, CreateChartBatchInput, CreateChartEntryInput, Surface, ToothCondition, ToothNumber } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { NOT_IN_PROGRESS, VISIT_NOT_FOUND, batchRefusal, entryRefusal } from "./chart.rules";

let n = 0;
const entry = (tooth: number, surfaces: Surface[], condition: ToothCondition, extra: Partial<ChartEntry> = {}): ChartEntry => ({
  id: `e${++n}`, clinicId: "c", patientId: "p", visitId: "v", tooth: tooth as ToothNumber, surfaces, condition, recordedBy: "d",
  recordedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), ...extra,
});
const open = { status: "in_progress" } as const;
const done = { status: "completed" } as const;
const input = (tooth: number, surfaces: Surface[], condition: ToothCondition, supersedes?: string): CreateChartEntryInput => ({
  visitId: "v", tooth: tooth as ToothNumber, surfaces, condition, ...(supersedes && { supersedes }),
});
const batch = (teeth: number[], condition: ToothCondition = "caries"): CreateChartBatchInput => ({
  visitId: "v", teeth: teeth as ToothNumber[], surfaces: [], condition,
});

describe("entryRefusal (chart/mocks.ts, POST /patients/:id/chart)", () => {
  it("refuses a missing visit (404) and one not in progress (409), before anything else", () => {
    expect(entryRefusal(input(74, ["O"], "caries"), undefined, [])).toEqual({ status: 404, message: VISIT_NOT_FOUND });
    expect(entryRefusal(input(51, ["O"], "caries"), done, [])).toEqual({ status: 409, message: NOT_IN_PROGRESS }); // not the surface's 400
  });

  it("refuses a surface the tooth doesn't have", () => {
    expect(entryRefusal(input(51, ["O"], "caries"), open, [])).toEqual({ status: 400, message: "Tooth 51 has no such surface" });
    expect(entryRefusal(input(74, ["O"], "caries"), open, [])).toBeUndefined();
    expect(entryRefusal(input(51, ["I"], "caries"), open, [])).toBeUndefined();
  });

  it("refuses a finding on an extracted or missing tooth until that entry is corrected", () => {
    for (const gone of ["extracted", "missing"] as const) {
      const pulled = entry(85, [], gone);
      expect(entryRefusal(input(85, ["O"], "caries"), open, [pulled])).toEqual({
        status: 409, message: "Tooth 85 is recorded as extracted or missing. Correct that entry instead",
      });
    }
    const pulled = entry(85, [], "extracted");
    const fixed = entry(85, [], "sound", { supersedes: pulled.id });
    expect(entryRefusal(input(85, ["O"], "caries"), open, [pulled, fixed])).toBeUndefined();
    expect(entryRefusal(input(85, [], "sound", pulled.id), open, [pulled])).toBeUndefined(); // a correction skips the gone check
  });

  it("keeps a correction on the same tooth, and corrects an entry once", () => {
    const first = entry(51, [], "caries");
    expect(entryRefusal(input(51, [], "sound", "nope"), open, [first])).toEqual({ status: 400, message: "A correction must replace an entry on the same tooth" });
    expect(entryRefusal(input(52, [], "sound", first.id), open, [first])).toEqual({ status: 400, message: "A correction must replace an entry on the same tooth" });
    const fix = entry(51, [], "sound", { supersedes: first.id });
    expect(entryRefusal(input(51, [], "restored", first.id), open, [first, fix])).toEqual({ status: 409, message: "That entry has already been corrected" });
  });
});

describe("batchRefusal (chart/mocks.ts, POST /patients/:id/chart/batch)", () => {
  it("refuses a missing visit and one not in progress", () => {
    expect(batchRefusal(batch([54, 85]), undefined, [])).toEqual({ status: 404, message: VISIT_NOT_FOUND });
    expect(batchRefusal(batch([54, 85]), done, [])).toEqual({ status: 409, message: NOT_IN_PROGRESS });
  });

  it("names every gone tooth in the order picked, and passes when none is", () => {
    const entries = [entry(85, [], "extracted"), entry(75, [], "missing")];
    expect(batchRefusal(batch([54, 85]), open, entries)).toEqual({
      status: 409, message: "Tooth 85 is recorded as extracted or missing. Unpick it, or correct that entry",
    });
    expect(batchRefusal(batch([85, 54, 75]), open, entries)?.message).toMatch(/^Tooth 85, 75 is recorded/);
    expect(batchRefusal(batch([54, 64]), open, entries)).toBeUndefined();
  });
});
