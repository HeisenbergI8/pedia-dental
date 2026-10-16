import type { AddPlanItemInput } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { addRefusal, statusRefusal } from "./plan.rules";

const input = (tooth?: number): AddPlanItemInput => ({ procedureCode: "x", fee: 100, ...(tooth && { tooth }) }) as AddPlanItemInput;

describe("plan rules (plan/mocks.ts)", () => {
  it("refuses an unknown procedure, and a per-tooth one without a tooth", () => {
    expect(addRefusal(undefined, input())).toEqual({ status: 400, message: "Unknown procedure" });
    expect(addRefusal({ name: "Restoration", perTooth: true }, input())).toEqual({ status: 400, message: "Restoration is planned per tooth" });
    expect(addRefusal({ name: "Restoration", perTooth: true }, input(74))).toBeUndefined();
    expect(addRefusal({ name: "Follow-up", perTooth: false }, input())).toBeUndefined();
  });

  it("never changes a done item", () => {
    for (const status of ["planned", "in_progress", "declined"] as const) expect(statusRefusal({ status })).toBeUndefined();
    expect(statusRefusal({ status: "done" })).toEqual({ status: 409, message: "A completed item can't change" });
  });
});
