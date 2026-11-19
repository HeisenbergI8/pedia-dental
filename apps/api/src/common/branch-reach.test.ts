import { describe, expect, it } from "vitest";
import { reachesBranch } from "./branch-reach";

describe("reachesBranch (#10)", () => {
  const imus = [{ id: "branch_imus" }];
  it("lets staff reach only a branch they work at", () => {
    const admin = { user: { roles: ["admin", "dentist"] as const }, branches: imus };
    expect(reachesBranch(admin, "branch_imus")).toBe(true);
    expect(reachesBranch(admin, "branch_dasma")).toBe(false);
  });

  it("lets the Owner reach every branch, an archived one included", () => {
    expect(reachesBranch({ user: { roles: ["owner", "dentist"] }, branches: imus }, "branch_archived")).toBe(true);
  });
});
