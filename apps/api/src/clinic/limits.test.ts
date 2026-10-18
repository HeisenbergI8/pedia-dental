import { describe, expect, it } from "vitest";
import { limitRefusal, usageOf } from "./limits";

describe("tier limits as data (decisions #5–#10)", () => {
  it("refuses a second branch and a sixth login on Small, in the mock's words", () => {
    expect(limitRefusal("small", "branches", 1)).toBe("Your Small plan includes 1 branch. Contact Primolar to upgrade.");
    expect(limitRefusal("small", "staffLogins", 5)).toBe("Your Small plan includes 5 staff logins. Contact Primolar to upgrade.");
    expect(limitRefusal("small", "staffLogins", 4)).toBeUndefined();
  });

  it("blocks only the next one after a downgrade, and never limits Big", () => {
    expect(limitRefusal("small", "branches", 3)).toBe("Your Small plan includes 1 branch. Contact Primolar to upgrade.");
    expect(limitRefusal("mid", "branches", 2)).toBeUndefined();
    expect(limitRefusal("big", "staffLogins", 10_000)).toBeUndefined();
  });

  it("reports usage beside the tier's limits, null for unlimited", () => {
    const use = { storageBytes: 10, textParts: 3, month: "2026-10" };
    expect(usageOf("small", { branches: 1, staffLogins: 5 }, use)).toEqual({
      tier: "small", branches: { inUse: 1, limit: 1 }, staffLogins: { inUse: 5, limit: 5 },
      storage: { inUse: 10, limit: 2 * 1024 ** 3 }, texts: { inUse: 3, limit: 300 }, month: "2026-10",
    });
    expect(usageOf("big", { branches: 4, staffLogins: 30 }, use).branches.limit).toBeNull();
  });
});
