import { describe, expect, it } from "vitest";
import { newPin, temporaryPassword } from "./secrets";

describe("a new login's one-time secrets (decision #21)", () => {
  it("are in the mock's formats, and never use characters that read alike", () => {
    const passwords = Array.from({ length: 300 }, temporaryPassword);
    for (const p of passwords) expect(p).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(passwords.join("")).not.toMatch(/[01OIlo]/);
    for (let i = 0; i < 100; i++) expect(newPin()).toMatch(/^\d{4}$/);
    expect(new Set(passwords).size).toBe(passwords.length);
  });
});
