import { describe, expect, it } from "vitest";
import { canResetDemoData, demoHelp } from "./demo";

const q = (s: "success" | "pending" | "error") => ({ isSuccess: s === "success", isPending: s === "pending", isError: s === "error" });

describe("the demo's help (B13c1 E4)", () => {
  it("shows whenever the backend lists demo logins, mocks off included", () => {
    expect((["enabled", "hybrid", "disabled"] as const).map((m) => demoHelp(m, q("success")))).toEqual(["show", "show", "show"]);
  });
  it("stays hidden with mocks off until the API says it is a demo, and when it says no (404)", () => {
    expect([demoHelp("disabled", q("pending")), demoHelp("disabled", q("error"))]).toEqual(["hide", "hide"]);
  });
  it("shows MSW's own loading and failure", () => {
    expect([demoHelp("enabled", q("pending")), demoHelp("hybrid", q("error"))]).toEqual(["loading", "failed"]);
  });
  it("offers Reset demo data only while MSW holds the data", () => {
    expect((["enabled", "hybrid", "disabled"] as const).map(canResetDemoData)).toEqual([true, true, false]);
  });
});
