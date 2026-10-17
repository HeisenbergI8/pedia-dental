import { describe, expect, it } from "vitest";
import { signLink, verifyLink } from "./local-links";

const SECRET = "s".repeat(32);
const claims = { key: "clinics/clinic_a/photos/f1.png", exp: 2_000, name: "bea.png", download: false };
const edit = (token: string, at: number) => `${token.slice(0, at)}${token[at] === "A" ? "B" : "A"}${token.slice(at + 1)}`;

describe("local file links (B10 E2, E8)", () => {
  it("verifies until its expiry, and not at or after it", () => {
    const token = signLink(SECRET, claims);
    expect(verifyLink(SECRET, token, 1_999)).toEqual(claims);
    expect(verifyLink(SECRET, token, 2_000)).toBeUndefined();
  });

  it("refuses another secret, an edited body or signature, an extra segment and junk", () => {
    const token = signLink(SECRET, claims);
    const dot = token.indexOf(".");
    for (const bad of [edit(token, 2), edit(token, dot + 3), `${token}.x`, "junk", "a.b", `${Buffer.from("{").toString("base64url")}.x`]) {
      expect(verifyLink(SECRET, bad, 0)).toBeUndefined();
    }
    expect(verifyLink("t".repeat(32), token, 0)).toBeUndefined();
    const notClaims = Buffer.from(JSON.stringify({ key: 1 })).toString("base64url");
    expect(verifyLink(SECRET, `${notClaims}.${signLink(SECRET, claims).split(".")[1]}`, 0)).toBeUndefined();
  });

  it("can't be re-pointed at another clinic's key with the old signature", () => {
    const token = signLink(SECRET, claims);
    const other = Buffer.from(JSON.stringify({ ...claims, key: "clinics/clinic_b/photos/f1.png" })).toString("base64url");
    expect(verifyLink(SECRET, `${other}.${token.split(".")[1]}`, 0)).toBeUndefined();
  });
});
