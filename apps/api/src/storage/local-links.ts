import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** What a local-disk link carries (E2). Signed, not encrypted: it names a key, never patient data. */
const Claims = z.object({
  key: z.string().max(300),
  exp: z.number().int(),
  name: z.string().max(255),
  download: z.boolean(),
});
export type LinkClaims = z.infer<typeof Claims>;

const mac = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("base64url");

/** `<base64url claims>.<base64url HMAC-SHA256>`: URL-safe, one path segment. */
export function signLink(secret: string, claims: LinkClaims): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** The claims of a live, untampered link; undefined for anything else (another secret, an edit, past `exp`, junk). */
export function verifyLink(secret: string, token: string, nowMs: number): LinkClaims | undefined {
  const [body, signature, ...rest] = token.split(".");
  if (!body || !signature || rest.length) return undefined;
  const want = Buffer.from(mac(secret, body));
  const got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  const claims = Claims.safeParse(parsed);
  return claims.success && claims.data.exp > nowMs ? claims.data : undefined;
}
