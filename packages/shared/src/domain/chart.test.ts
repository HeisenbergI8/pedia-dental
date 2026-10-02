import { describe, expect, it } from "vitest";
import { deriveChart, isToothGone } from "./chart";
import type { ChartEntry } from "../schemas/chart";

const base = { clinicId: "c1", patientId: "p1", visitId: "v1", recordedBy: "d1" };
const entry = (e: Partial<ChartEntry> & Pick<ChartEntry, "id" | "tooth" | "condition" | "recordedAt">): ChartEntry => ({
  ...base,
  surfaces: [],
  ...e,
});

describe("deriveChart", () => {
  it("keeps the latest condition per surface", () => {
    const chart = deriveChart([
      entry({ id: "a", tooth: 74, surfaces: ["O"], condition: "caries", recordedAt: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", tooth: 74, surfaces: ["O"], condition: "restored", recordedAt: "2026-02-01T00:00:00Z" }),
    ]);
    expect(chart.get(74)?.surfaces.O).toBe("restored");
    expect(chart.get(74)?.history).toHaveLength(2);
  });
  it("whole-tooth findings reset surface detail", () => {
    const chart = deriveChart([
      entry({ id: "a", tooth: 84, surfaces: ["O"], condition: "caries", recordedAt: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", tooth: 84, condition: "extracted", recordedAt: "2026-02-01T00:00:00Z" }),
    ]);
    expect(chart.get(84)?.whole).toBe("extracted");
    expect(chart.get(84)?.surfaces).toEqual({});
  });
  it("ignores superseded (corrected) entries", () => {
    const chart = deriveChart([
      entry({ id: "a", tooth: 51, surfaces: ["M"], condition: "caries", recordedAt: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", tooth: 51, surfaces: ["M"], condition: "sound", recordedAt: "2026-01-01T01:00:00Z", supersedes: "a" }),
    ]);
    expect(chart.get(51)?.surfaces.M).toBe("sound");
  });
  it("a late correction takes the place of the entry it corrects, not the latest one", () => {
    const chart = deriveChart([
      entry({ id: "a", tooth: 74, surfaces: ["O"], condition: "caries", recordedAt: "2026-01-01T00:00:00Z" }),
      entry({ id: "b", tooth: 74, surfaces: ["O"], condition: "restored", recordedAt: "2026-02-01T00:00:00Z" }),
      // Months later, visit 1's finding is corrected to a sealant. Visit 2's restoration still stands.
      entry({ id: "c", tooth: 74, surfaces: ["O"], condition: "sealant", recordedAt: "2026-05-01T00:00:00Z", supersedes: "a" }),
    ]);
    expect(chart.get(74)?.surfaces.O).toBe("restored");
  });
  it("knows an extracted tooth is gone until the extraction is corrected", () => {
    const extracted = entry({ id: "a", tooth: 84, condition: "extracted", recordedAt: "2026-01-01T00:00:00Z" });
    expect(isToothGone(deriveChart([extracted]).get(84))).toBe(true);
    const fix = entry({ id: "b", tooth: 84, condition: "sound", recordedAt: "2026-01-02T00:00:00Z", supersedes: "a" });
    expect(isToothGone(deriveChart([extracted, fix]).get(84))).toBe(false);
  });
});
