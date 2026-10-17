import { describe, expect, it } from "vitest";
import { LINK_MARK, PORTAL_LINK_LIFETIME_MS, accountText, isAccountText, linkPath, loginIdOf, maskedNumber } from "./portal";
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
});
