import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

/**
 * What a local-disk link carries (E2): the key, its expiry, the saved file's name and the disposition. The name is the
 * child's (photoFileName), so the token is encrypted, not just signed: a URL path is logged (logger.ts) and kept in
 * browser history, and must never show a child's name (B10 audit finding 1). AES-256-GCM authenticates as it encrypts,
 * so an edited token is refused as a forged one was.
 */
const Claims = z.object({
  key: z.string().max(300),
  exp: z.number().int(),
  name: z.string().max(255),
  download: z.boolean(),
});
export type LinkClaims = z.infer<typeof Claims>;

const keyOf = (secret: string) => createHash("sha256").update(secret).digest();
const IV = 12;
const TAG = 16;

/** base64url(iv | tag | ciphertext): URL-safe, one path segment, opaque. */
export function signLink(secret: string, claims: LinkClaims): string {
  const iv = randomBytes(IV);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The claims of a live, untampered link; undefined for anything else (another secret, an edit, past `exp`, junk). */
export function verifyLink(secret: string, token: string, nowMs: number): LinkClaims | undefined {
  if (!/^[\w-]+$/.test(token)) return undefined;
  const raw = Buffer.from(token, "base64url");
  if (raw.length <= IV + TAG) return undefined;
  let parsed: unknown;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), raw.subarray(0, IV));
    decipher.setAuthTag(raw.subarray(IV, IV + TAG));
    parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(IV + TAG)), decipher.final()]).toString("utf8"));
  } catch {
    return undefined;
  }
  const claims = Claims.safeParse(parsed);
  return claims.success && claims.data.exp > nowMs ? claims.data : undefined;
}
