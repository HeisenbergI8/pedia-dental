import { describe, expect, it } from "vitest";
import { DAILY_TEXT_PARTS_FLOOR, GB, dailyTextCap, formatStorage, inviteTextsUsedUpMessage, manilaMonth, storageFullMessage, storageRefusal, textAllowance, textAllowanceNotice, textPartsRefusal } from "./allowance";
import { FAILURE } from "./sending";
import { TIER_LIMITS } from "./tenancy";

describe("plan allowances (B12 decisions 1, 2)", () => {
  it("gives each plan its storage and texts", () => {
    expect([TIER_LIMITS.small, TIER_LIMITS.mid, TIER_LIMITS.big].map((l) => [l.storageBytes, l.textParts])).toEqual([[25 * GB, 500], [100 * GB, 1500], [500 * GB, 5000]]);
  });
  it("stores up to the limit exactly, and refuses one byte more", () => {
    expect(storageRefusal("small", 25 * GB - 10, 10)).toBeUndefined();
    expect(storageRefusal("small", 25 * GB - 10, 11)).toBe(storageFullMessage("small"));
    expect(storageFullMessage("small")).toContain("the Starter plan includes 25 GB");
  });
  it("writes storage as people read it", () => {
    expect([formatStorage(0), formatStorage(1024 ** 2 - 1), formatStorage(1.45 * GB), formatStorage(50 * GB)]).toEqual(["0 MB", "1 MB", "1.5 GB", "50 GB"]);
  });
});

describe("text allowance (B12 decisions 3, 18, 19)", () => {
  it("never refuses a reset or a number-change warning; refuses a reminder or an invite that would pass the month", () => {
    const dec = "2026-12";
    expect(textPartsRefusal("password_reset", 3000, 2, 300, dec)).toBeUndefined();
    expect(textPartsRefusal("sign_in_changed", 3000, 2, 300, dec)).toBeUndefined();
    expect(textPartsRefusal("portal_invite", 299, 2, 300, dec)).toBe(FAILURE.textLimit); // text-abuse limits: staff send it
    expect(textPartsRefusal("portal_invite", 298, 2, 300, dec)).toBeUndefined();
    expect(textPartsRefusal("portal_invite", 3000, 2, 300, "2026-11")).toBeUndefined(); // before INVITES_COUNT_FROM
    expect(textPartsRefusal("appointment_reminder", 298, 3, 300, dec)).toBe(FAILURE.textLimit);
    expect(textPartsRefusal("appointment_reminder", 298, 2, 300, "2026-11")).toBeUndefined();
  });
  it("warns at 80% and says so at 100%, naming the next month", () => {
    expect(textAllowanceNotice({ inUse: 239, limit: 300 }, "2026-10")).toBeUndefined();
    expect(textAllowanceNotice({ inUse: 240, limit: 300 }, "2026-10")?.level).toBe("warning");
    expect(textAllowanceNotice({ inUse: 300, limit: 300 }, "2026-10")).toMatchObject({ level: "limit", text: expect.stringContaining("for October 2026") });
    expect(textAllowanceNotice({ inUse: 301, limit: 300 }, "2026-12")?.text).toContain("until 1 January");
    // Feature 16 (revised), D13: both notices point at a top-up as well as an upgrade.
    expect(textAllowanceNotice({ inUse: 400, limit: 500 }, "2026-10")?.text).toContain("Buy more texts");
    expect(textAllowanceNotice({ inUse: 500, limit: 500 }, "2026-10")?.text).toContain("Buy more texts");
  });
  it("says the limit is reached once fewer parts are left than a reminder needs (BotC-7)", () => {
    expect(textAllowanceNotice({ inUse: 1495, limit: 1500 }, "2026-11")?.level).toBe("warning");
    const nearly = textAllowanceNotice({ inUse: 1499, limit: 1500 }, "2026-11");
    expect(nearly).toMatchObject({ level: "limit", text: expect.stringContaining("1499 of your 1500 texts for November 2026, too few for another reminder.") });
    expect(nearly?.text).toContain("Automatic reminders are not sent until 1 December or until you buy more; portal invites and password resets still go.");
  });
  it("says invites stop with reminders only from December 2026, when they start counting (text-abuse limits)", () => {
    expect(textAllowanceNotice({ inUse: 300, limit: 300 }, "2026-12")?.text).toContain("Automatic reminders and portal invites are not sent until 1 January");
    expect(textAllowanceNotice({ inUse: 240, limit: 300 }, "2026-12")?.text).toContain("automatic reminders and portal invites stop until 1 January");
    expect(textAllowanceNotice({ inUse: 240, limit: 300 }, "2026-11")?.text).toContain("At 300, automatic reminders stop until 1 December");
  });
  it("adds the month's confirmed top-ups to the plan's texts (D1)", () => {
    expect([textAllowance("small", 0), textAllowance("small", 500), textAllowance("big", 100)]).toEqual([500, 1000, 5100]);
  });
  it("takes the month from the server's Manila date", () => {
    expect(manilaMonth("2026-11-01")).toBe("2026-11");
  });
});

describe("text-abuse limits (2026-11-27)", () => {
  it("names the next month when an invite can't be sent", () => {
    expect(inviteTextsUsedUpMessage("2026-12")).toContain("on 1 January");
  });
  it("caps a day at three times the clinics' months spread over 30 days, never below the floor", () => {
    expect(dailyTextCap([])).toBe(DAILY_TEXT_PARTS_FLOOR);
    expect(dailyTextCap(Array(10).fill(500))).toBe(DAILY_TEXT_PARTS_FLOOR); // 10 Starter clinics: 500
    expect(dailyTextCap(Array(20).fill(1500))).toBe(3000); // 30,000 a month / 30 × 3
    expect(dailyTextCap([5000], 400)).toBe(400); // SMS_DAILY_PARTS_MAX caps it, floor or not
    expect(dailyTextCap(Array(20).fill(1500), 10_000)).toBe(3000);
  });
});
