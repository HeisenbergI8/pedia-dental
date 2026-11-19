import { describe, expect, it } from "vitest";
import { limitRefusal, usageOf } from "./limits";

describe("tier limits as data (decisions #5–#10)", () => {
  it("refuses a second branch and an eleventh login on Starter, in the mock's words", () => {
    expect(limitRefusal("small", "branches", 1)).toBe("Your Starter plan includes 1 branch. Contact Primolar to upgrade.");
    expect(limitRefusal("small", "staffLogins", 10)).toBe("Your Starter plan includes 10 staff logins. Contact Primolar to upgrade.");
    expect(limitRefusal("small", "staffLogins", 9)).toBeUndefined();
  });

  it("blocks only the next one after a downgrade, and never limits Pro", () => {
    expect(limitRefusal("small", "branches", 3)).toBe("Your Starter plan includes 1 branch. Contact Primolar to upgrade.");
    expect(limitRefusal("mid", "branches", 2)).toBeUndefined();
    expect(limitRefusal("big", "staffLogins", 10_000)).toBeUndefined();
  });

  it("reports usage beside the tier's limits, null for unlimited", () => {
    const use = { storageBytes: 10, textParts: 3, textTopUp: 0, month: "2026-10" };
    expect(usageOf("small", { branches: 1, staffLogins: 5 }, use)).toEqual({
      tier: "small", branches: { inUse: 1, limit: 1 }, staffLogins: { inUse: 5, limit: 10 },
      storage: { inUse: 10, limit: 25 * 1024 ** 3 }, texts: { inUse: 3, limit: 500 }, textTopUp: 0, month: "2026-10",
    });
    expect(usageOf("big", { branches: 4, staffLogins: 30 }, use).branches.limit).toBeNull();
  });
});
