import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/** #2: sent by the web's /api proxy (apps/web/src/middleware.ts) on every request it forwards. */
export const ORIGIN_HEADER = "x-primolar-origin";

/**
 * The probes stay open: the ALB's target health check (/api/health/ready, packages/infra service-stack.ts) and the
 * container check (/api/health/live) never pass through the web, and they say nothing but "up".
 */
const OPEN_PATHS = new Set(["/api/health", "/api/health/live", "/api/health/ready"]);

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * #2, the origin lock: a request that didn't come through the web's proxy gets 403, so a caller can't skip Vercel and
 * choose the X-Forwarded-For the rate limits read (TRUST_PROXY_HOPS). The load balancer refuses it first; this is
 * the second check. Compared in constant time (both sides hashed to the same length).
 */
export function originCheck(secret: string) {
  const expected = digest(secret);
  return (req: Request, res: Response, next: NextFunction) => {
    if (OPEN_PATHS.has(req.path)) return next();
    const sent = req.headers[ORIGIN_HEADER];
    if (typeof sent === "string" && timingSafeEqual(digest(sent), expected)) return next();
    res.status(403).type("text/plain").send("Forbidden.");
  };
}
