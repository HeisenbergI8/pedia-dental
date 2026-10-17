import { describe, expect, it } from "vitest";
import { signLink, verifyLink } from "./local-links";

const SECRET = "s".repeat(32);
const claims = { key: "clinics/clinic_a/photos/f1.png", exp: 2_000, name: "mendoza-bea-intraoral-74-2026-10-02.png", download: false };
const flip = (token: string, at: number) => `${token.slice(0, at)}${token[at] === "A" ? "B" : "A"}${token.slice(at + 1)}`;

describe("local file links (B10 E2, E8)", () => {
  it("verifies until its expiry, and not at or after it", () => {
    const token = signLink(SECRET, claims);
    expect(verifyLink(SECRET, token, 1_999)).toEqual(claims);
    expect(verifyLink(SECRET, token, 2_000)).toBeUndefined();
  });

  it("is opaque: no key, name or clinic can be read from the URL (audit finding 1)", () => {
    const token = signLink(SECRET, claims);
    const decoded = Buffer.from(token, "base64url").toString("latin1");
    for (const secret of ["mendoza", "bea", "clinic_a", "2026-10-02"]) expect(decoded).not.toContain(secret);
    expect(token).toMatch(/^[\w-]+$/);
    expect(signLink(SECRET, claims)).not.toBe(token); // a fresh IV each time
  });

  it("refuses another secret, any edited character, and junk", () => {
    const token = signLink(SECRET, claims);
    for (const at of [0, 13, 20, token.length - 2]) expect(verifyLink(SECRET, flip(token, at), 0)).toBeUndefined();
    for (const bad of ["junk", "a.b", "", "x".repeat(40), `${token}.x`]) expect(verifyLink(SECRET, bad, 0)).toBeUndefined();
    expect(verifyLink("t".repeat(32), token, 0)).toBeUndefined();
  });

  it("can't be re-pointed at another clinic's key without the secret", () => {
    const forged = Buffer.from(JSON.stringify({ ...claims, key: "clinics/clinic_b/photos/f1.png" })).toString("base64url");
    expect(verifyLink(SECRET, forged, 0)).toBeUndefined();
  });
});
