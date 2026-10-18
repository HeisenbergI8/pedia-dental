import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type { Env } from "./config/env";

/**
 * Every HTTP-level setting, applied by main.ts and by both test apps (B13a), so a test sees the headers, CORS and
 * client address production does. Call before `listen` / `init`.
 */
export function configureHttp(app: INestApplication, env: Pick<Env, "CORS_ORIGIN" | "TRUST_PROXY_HOPS">): void {
  // Behind the ALB the socket is the balancer's: read the client from X-Forwarded-For, trusting exactly this many hops.
  // The rate limits key on req.ip (auth/rate-limit.ts, signups.service.ts).
  (app as NestExpressApplication).set("trust proxy", env.TRUST_PROXY_HOPS);
  // The API serves JSON, plain-text errors, redirects and (locally) file bytes; it never serves a page, so nothing may
  // run or frame from it. CORP same-site: the web reads files through its own /api proxy (next.config.ts).
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: { action: "deny" }, // agrees with frame-ancestors 'none'
    }),
  );
  app.setGlobalPrefix("api");
  // Exact origins only (env.ts refuses "*" and paths); credentials for the httpOnly session cookies.
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
}
