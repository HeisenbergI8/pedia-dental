import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, matchTotp, newTotpSecret, otpauthUri, totpStep } from "./totp";

/** RFC 6238 Appendix B's SHA-1 key: the ASCII "12345678901234567890". */
const RFC_KEY = Buffer.from("12345678901234567890");
const RFC_SECRET = base32Encode(RFC_KEY);
const at = (unixSeconds: number) => new Date(unixSeconds * 1000);

describe("TOTP (security review #8)", () => {
  it("round-trips base32 and refuses what isn't base32", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET)).toEqual(RFC_KEY);
    expect(base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq====")).toEqual(RFC_KEY);
    expect(base32Decode("not base32!")).toBeUndefined();
    const fresh = newTotpSecret();
    expect([fresh.length, base32Decode(fresh)!.length]).toEqual([32, 20]);
  });

  it("matches RFC 6238's SHA-1 test vectors (their last six digits)", () => {
    // Appendix B: 94287082, 07081804, 14050471, 89005924, 69279037, 65353130.
    const vectors: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]];
    for (const [t, code] of vectors) expect([t, hotp(RFC_KEY, totpStep(at(t)))]).toEqual([t, code]);
  });

  it("accepts one step either side of now and nothing further, saying which step matched", () => {
    const now = at(1234567890);
    const step = totpStep(now);
    expect(matchTotp(RFC_SECRET, "005924", now)).toBe(step);
    expect(matchTotp(RFC_SECRET, hotp(RFC_KEY, step - 1), now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_KEY, step + 1), now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, hotp(RFC_KEY, step - 2), now)).toBeUndefined();
    expect(matchTotp(RFC_SECRET, hotp(RFC_KEY, step + 2), now)).toBeUndefined();
  });

  it("takes the code with a space, and refuses a malformed code or secret", () => {
    const now = at(1234567890);
    expect(matchTotp(RFC_SECRET, "005 924", now)).toBe(totpStep(now));
    expect(matchTotp(RFC_SECRET, "05924", now)).toBeUndefined();
    expect(matchTotp(RFC_SECRET, "abcdef", now)).toBeUndefined();
    expect(matchTotp("!!!", "005924", now)).toBeUndefined();
    expect(matchTotp("", "005924", now)).toBeUndefined();
  });

  it("builds the otpauth URI an authenticator app reads", () => {
    expect(otpauthUri("JBSWY3DPEHPK3PXP", "ops@primolar.ph")).toBe(
      "otpauth://totp/Primolar%3Aops%40primolar.ph?secret=JBSWY3DPEHPK3PXP&issuer=Primolar&algorithm=SHA1&digits=6&period=30",
    );
  });
});
