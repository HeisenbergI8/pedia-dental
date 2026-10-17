import { describe, expect, it } from "vitest";
import { ChangePasswordInput, LoginInput } from "./auth";

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
