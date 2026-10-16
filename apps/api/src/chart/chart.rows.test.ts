import { seedPlatform } from "@pedia/seed";
import { deriveChart, type ChartEntry } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { chartEntryRow, toChartEntry } from "./chart.rows";

const platform = seedPlatform();
const tenants = Object.entries(platform.tenants);

describe("chart entry rows", () => {
  it("stores every seeded entry so that toChartEntry reads back exactly the same entry", () => {
    let seen = 0;
    for (const [clinicId, db] of tenants) {
      for (const e of db.chartEntries) {
        expect(toChartEntry({ ...chartEntryRow(e), clinicId })).toEqual({ ...e, clinicId });
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("derives the same chart, history included, from the round-tripped entries (the mock's chart)", () => {
    const [clinicId, db] = tenants.find(([, t]) => t.chartEntries.length)!;
    const count = (id: string) => db.chartEntries.filter((e) => e.patientId === id).length;
    const busiest = db.chartEntries.map((e) => e.patientId).sort((a, b) => count(b) - count(a))[0]!;
    const entries = db.chartEntries.filter((e) => e.patientId === busiest);
    const back = entries.map((e) => toChartEntry({ ...chartEntryRow(e), clinicId }));
    expect(deriveChart(back)).toEqual(deriveChart(entries.map((e) => ({ ...e, clinicId }))));
  });

  it("leaves note and supersedes absent when they are, and refuses a tooth outside the chart", () => {
    const e: ChartEntry = {
      id: "e1", clinicId: "clinic_a", patientId: "p1", visitId: "v1", tooth: 74, surfaces: ["O"], condition: "caries",
      recordedBy: "staff_reyes", recordedAt: "2026-06-01T01:30:00.000Z",
    };
    const back = toChartEntry({ ...chartEntryRow(e), clinicId: "clinic_a" });
    expect(back).not.toHaveProperty("note");
    expect(back).not.toHaveProperty("supersedes");
    expect(toChartEntry({ ...chartEntryRow(e), note: "", clinicId: "clinic_a" }).note).toBe("");
    expect(() => toChartEntry({ ...chartEntryRow(e), tooth: 19, clinicId: "clinic_a" })).toThrow();
  });
});
