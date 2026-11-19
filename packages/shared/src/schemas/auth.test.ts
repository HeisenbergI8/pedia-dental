import { describe, expect, it } from "vitest";
import { COMMON_PASSWORDS } from "../domain/common-passwords";
import { COMMON_PASSWORD_MESSAGE, ChangePasswordInput, LoginInput, NewPassword, passwordIsLogin } from "./auth";

describe("LoginInput (B11 decision 4)", () => {
  it("takes a mobile in any common form, or an email, and gives the same value parsed again", () => {
    const once = LoginInput.parse({ email: "0917 123 4567", password: "x" });
    expect(once.email).toBe("639171234567");
    expect(LoginInput.parse(once).email).toBe("639171234567");
    expect(LoginInput.parse({ email: "Rosa@Example.com", password: "x" }).email).toBe("rosa@example.com");
  });
  it("says what to type when it is neither", () => {
    const r = LoginInput.safeParse({ email: "046 471 2580", password: "x" });
    expect(r.success ? "" : r.error.issues[0]!.message).toBe("Enter a mobile number like 0917 123 4567, or an email address");
  });
});

describe("ChangePasswordInput (B11 decision 8)", () => {
  it("keeps the staff rule: 8 characters, and a different password", () => {
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "short" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "pass1234" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "new-pass-1" }).success).toBe(true);
  });
});

describe("NewPassword (security review #7)", () => {
  it("refuses the most common passwords in any letter case, with a plain message", () => {
    for (const p of ["password", "Password1", "QWERTY123", "iloveyou1", "12345678"]) {
      const r = NewPassword.safeParse(p);
      expect([p, r.success ? "" : r.error.issues[0]!.message]).toEqual([p, COMMON_PASSWORD_MESSAGE]);
    }
    expect(NewPassword.safeParse("blue-tooth-garden").success).toBe(true);
  });

  it("keeps a list of about two hundred, every one in lower case", () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(180);
    for (const p of COMMON_PASSWORDS) expect(p).toBe(p.toLowerCase());
  });
});

describe("passwordIsLogin (security review #7)", () => {
  it("catches the person's email in any case, and their mobile in any common form", () => {
    expect(passwordIsLogin("Rosa@Example.com", ["rosa@example.com"])).toBe(true);
    expect(passwordIsLogin("09171234567", ["639171234567"])).toBe(true);
    expect(passwordIsLogin("0917 123 4567", [null, "639171234567"])).toBe(true);
    expect(passwordIsLogin("rosa@example.com", ["", undefined])).toBe(false);
    expect(passwordIsLogin("blue-tooth-garden", ["rosa@example.com", "639171234567"])).toBe(false);
  });
});
