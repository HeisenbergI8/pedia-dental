import type { AddPlanItemInput } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { addRefusal, findingRefusal, statusRefusal } from "./plan.rules";

const input = (tooth?: number): AddPlanItemInput => ({ procedureCode: "x", fee: 100, ...(tooth && { tooth }) }) as AddPlanItemInput;

describe("plan rules (plan/mocks.ts)", () => {
  it("refuses an unknown procedure, and a per-tooth one without a tooth", () => {
    expect(addRefusal(undefined, input())).toEqual({ status: 400, message: "Unknown procedure" });
    expect(addRefusal({ name: "Restoration", perTooth: true }, input())).toEqual({ status: 400, message: "Restoration is planned per tooth" });
    expect(addRefusal({ name: "Restoration", perTooth: true }, input(74))).toBeUndefined();
    expect(addRefusal({ name: "Follow-up", perTooth: false }, input())).toBeUndefined();
  });

  it("plans a chart finding once, for its own child and tooth (#28)", () => {
    const finding = { patientId: "p1", tooth: 74 };
    expect(findingRefusal(finding, "p1", { tooth: 74 }, undefined)).toBeUndefined();
    expect(findingRefusal(finding, "p1", {}, undefined)).toBeUndefined(); // a whole-mouth procedure from a finding
    expect(findingRefusal(undefined, "p1", { tooth: 74 }, undefined)).toEqual({ status: 400, message: "Unknown chart finding" });
    expect(findingRefusal(finding, "p2", { tooth: 74 }, undefined)).toEqual({ status: 400, message: "Unknown chart finding" });
    expect(findingRefusal(finding, "p1", { tooth: 75 }, undefined)).toEqual({ status: 400, message: "This finding is on tooth 74" });
    expect(findingRefusal(finding, "p1", { tooth: 74 }, "Restoration")).toEqual({ status: 409, message: "Restoration for this finding is already on the plan" });
  });

  it("never changes a done item", () => {
    for (const status of ["planned", "in_progress", "declined"] as const) expect(statusRefusal({ status })).toBeUndefined();
    expect(statusRefusal({ status: "done" })).toEqual({ status: 409, message: "A completed item can't change" });
  });
});
