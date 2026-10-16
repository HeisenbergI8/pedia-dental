import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { planProgress, type PlanItem } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { planItemRow, toPlanItem } from "./plan.rows";

const items = seedPlatform().tenants[DEMO_CLINIC_ID]!.planItems;
const back = (i: PlanItem) => toPlanItem({ ...planItemRow(i), clinicId: i.clinicId });

describe("plan item rows", () => {
  it("stores the seeded example plan so that it reads back the same, 3 of 6 done", () => {
    expect(items.map(back)).toEqual(items);
    expect(planProgress(items.map(back))).toEqual({ done: 3, total: 6 });
  });

  it("leaves tooth, source and completion absent when they are", () => {
    const i: PlanItem = { id: "i", clinicId: "c", patientId: "p", procedureCode: "D0120", fee: 50000, status: "planned", createdAt: "2026-06-01T01:30:00.000Z" };
    expect(Object.keys(back(i)).sort()).toEqual(Object.keys(i).sort());
  });

  it("refuses a stored tooth outside the chart", () => {
    const i = items[0]!;
    expect(() => toPlanItem({ ...planItemRow(i), tooth: 19, clinicId: i.clinicId })).toThrow();
  });
});
