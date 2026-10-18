import { describe, expect, it } from "vitest";
import { GB, formatStorage, manilaMonth, storageFullMessage, storageRefusal, textAllowanceNotice, textPartsRefusal } from "./allowance";
import { FAILURE } from "./sending";
import { TIER_LIMITS } from "./tenancy";

describe("plan allowances (B12 decisions 1, 2)", () => {
  it("gives each plan its storage and texts", () => {
    expect([TIER_LIMITS.small, TIER_LIMITS.mid, TIER_LIMITS.big].map((l) => [l.storageBytes, l.textParts])).toEqual([[2 * GB, 300], [10 * GB, 1000], [50 * GB, 3000]]);
  });
  it("stores up to the limit exactly, and refuses one byte more", () => {
    expect(storageRefusal("small", 2 * GB - 10, 10)).toBeUndefined();
    expect(storageRefusal("small", 2 * GB - 10, 11)).toBe(storageFullMessage("small"));
    expect(storageFullMessage("small")).toContain("the Small plan includes 2 GB");
  });
  it("writes storage as people read it", () => {
    expect([formatStorage(0), formatStorage(1024 ** 2 - 1), formatStorage(1.45 * GB), formatStorage(50 * GB)]).toEqual(["0 MB", "1 MB", "1.5 GB", "50 GB"]);
  });
});

describe("text allowance (B12 decisions 3, 18, 19)", () => {
  it("never refuses an invite or a reset, and refuses a reminder that would pass the month", () => {
    expect(textPartsRefusal("portal_invite", 3000, 2, 300)).toBeUndefined();
    expect(textPartsRefusal("password_reset", 3000, 2, 300)).toBeUndefined();
    expect(textPartsRefusal("appointment_reminder", 298, 3, 300)).toBe(FAILURE.textLimit);
    expect(textPartsRefusal("appointment_reminder", 298, 2, 300)).toBeUndefined();
  });
  it("warns at 80% and says so at 100%, naming the next month", () => {
    expect(textAllowanceNotice({ inUse: 239, limit: 300 }, "2026-10")).toBeUndefined();
    expect(textAllowanceNotice({ inUse: 240, limit: 300 }, "2026-10")?.level).toBe("warning");
    expect(textAllowanceNotice({ inUse: 300, limit: 300 }, "2026-10")).toMatchObject({ level: "limit", text: expect.stringContaining("for October 2026") });
    expect(textAllowanceNotice({ inUse: 301, limit: 300 }, "2026-12")?.text).toContain("until 1 January");
  });
  it("takes the month from the server's Manila date", () => {
    expect(manilaMonth("2026-11-01")).toBe("2026-11");
  });
});
