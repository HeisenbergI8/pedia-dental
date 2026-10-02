import { describe, expect, it } from "vitest";
import { itemsCompletedBy, planProgress } from "./plan";
import type { PlanItem } from "../schemas/plan";

let n = 0;
const item = (procedureCode: string, tooth?: number, status: PlanItem["status"] = "planned"): PlanItem => ({
  id: `i${++n}`,
  clinicId: "c1",
  patientId: "p1",
  procedureCode,
  tooth,
  fee: 0,
  status,
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, "0")}Z`,
});

describe("itemsCompletedBy", () => {
  const plan = [item("prophylaxis"), item("fluoride"), item("restoration", 51), item("restoration", 74), item("restoration", 84), item("follow_up")];

  it("completes one item per tooth treated", () => {
    expect(itemsCompletedBy("restoration", [74, 84, 85], plan).map((i) => i.tooth)).toEqual([74, 84]);
  });
  it("completes a tooth-less item once", () => {
    expect(itemsCompletedBy("prophylaxis", [], plan)).toHaveLength(1);
    expect(itemsCompletedBy("fluoride", [11, 21], plan).map((i) => i.procedureCode)).toEqual(["fluoride"]);
  });
  it("ignores other procedures and items already done or declined", () => {
    const closed = [item("restoration", 51, "done"), item("restoration", 74, "declined")];
    expect(itemsCompletedBy("restoration", [51, 74], closed)).toEqual([]);
    expect(itemsCompletedBy("pulpotomy", [84], plan)).toEqual([]);
  });
});

describe("planProgress", () => {
  it("counts the spec example: 3 of 6 done, declined left out", () => {
    const items = [item("a", undefined, "done"), item("b", undefined, "done"), item("c", undefined, "done"), item("d"), item("e", undefined, "in_progress"), item("f"), item("g", undefined, "declined")];
    expect(planProgress(items)).toEqual({ done: 3, total: 6 });
  });
});
