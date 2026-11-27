import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TEXT_LIMITS, LINK_MARK, PORTAL_LINK_LIFETIME_MS, accountText, inviteLimitReached, isAccountText, isFreeText, linkPath, uncountedKinds, loginIdOf, maskedNumber, numberChangedText, resetHeld,
} from "./portal";
import { smsSegments } from "./sending";

describe("loginIdOf (decision 4)", () => {
  it("reads every way a parent types a mobile as one number, and an email in lowercase", () => {
    for (const typed of ["0917 123 4567", "09171234567", "+63 917-123-4567", "639171234567", "9171234567"]) {
      expect(loginIdOf(typed), typed).toEqual({ kind: "phone", value: "639171234567" });
    }
    expect(loginIdOf("  Rosa@Example.COM ")).toEqual({ kind: "email", value: "rosa@example.com" });
  });
  it("refuses a landline, a short number and a broken email", () => {
    for (const typed of ["(046) 471 2580", "0917123", "rosa@", "rosa", ""]) expect(loginIdOf(typed), typed).toBeUndefined();
  });
});

describe("account texts (E4)", () => {
  it("masks a number to its prefix and last four", () => {
    expect(maskedNumber("0917 123 4567")).toBe("0917 ••• 4567");
    expect(maskedNumber("not a mobile")).toBe("your number");
  });
  it("keeps the link last, and an invite with a long clinic name to two texts", () => {
    const link = `https://app.primolar.ph${linkPath("x".repeat(32))}`;
    for (const purpose of ["invite", "reset"] as const) {
      const body = accountText(purpose, { clinicName: "Kiddie Smiles Pediatric Dental Clinic", childName: "Bea" }, link);
      expect(body.endsWith(`#t=${"x".repeat(32)}`)).toBe(true);
      expect(smsSegments(body)).toBeLessThanOrEqual(2);
    }
    expect(accountText("reset", { clinicName: "Ngiti" })).toContain(LINK_MARK);
  });
  it("lasts 72 hours for an invite and 30 minutes for a reset (decisions 5, 6)", () => {
    expect(PORTAL_LINK_LIFETIME_MS).toEqual({ invite: 259_200_000, reset: 1_800_000 });
  });
  it("tells account texts from parent messages", () => {
    expect([isAccountText("portal_invite"), isAccountText("password_reset"), isAccountText("recall")]).toEqual([true, true, false]);
  });
  it("leaves only resets and number-change warnings free: staff send invites, so the clinic pays (text-abuse limits)", () => {
    expect(["portal_invite", "password_reset", "sign_in_changed", "recall"].map(isFreeText)).toEqual([false, true, true, false]);
  });
  it("counts invites only from December 2026, so invites sent while onboarding never use up November", () => {
    expect(uncountedKinds("2026-11")).toContain("portal_invite");
    expect(uncountedKinds("2026-12")).not.toContain("portal_invite");
    expect(uncountedKinds("2027-03")).toEqual(["password_reset", "sign_in_changed"]);
  });
});

describe("account text limits (audit #3, #4, #21)", () => {
  it("treats the sign-in-changed text as an account text, with no link in it", () => {
    expect(isAccountText("sign_in_changed")).toBe(true);
    expect(numberChangedText("Bulilit")).toBe("Your Primolar sign-in number for Bulilit was changed. If this wasn't you, call the clinic.");
    expect(numberChangedText("Bulilit")).not.toContain(LINK_MARK);
  });

  it("refuses the fourth invite to a parent, then the clinic's 201st, in that order", () => {
    expect(inviteLimitReached(2, 199)).toBeUndefined();
    expect(inviteLimitReached(3, 0)).toBe("guardian");
    expect(inviteLimitReached(0, ACCOUNT_TEXT_LIMITS.invitesPerClinic)).toBe("clinic");
    expect(inviteLimitReached(3, ACCOUNT_TEXT_LIMITS.invitesPerClinic)).toBe("guardian");
  });

  it("holds a reset for a day after a number change, and past the clinic's daily ceiling", () => {
    const now = new Date("2026-11-19T10:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms);
    expect(resetHeld(0, undefined, now)).toBeUndefined();
    expect(resetHeld(0, ago(ACCOUNT_TEXT_LIMITS.resetHoldAfterNumberChangeMs - 1), now)).toBe("number_changed");
    expect(resetHeld(0, ago(ACCOUNT_TEXT_LIMITS.resetHoldAfterNumberChangeMs), now)).toBeUndefined();
    expect(resetHeld(ACCOUNT_TEXT_LIMITS.resetsPerClinic - 1, undefined, now)).toBeUndefined();
    expect(resetHeld(ACCOUNT_TEXT_LIMITS.resetsPerClinic, undefined, now)).toBe("clinic_ceiling");
  });
});
