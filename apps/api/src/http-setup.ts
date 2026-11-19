import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import type { Env } from "./config/env";
import { originCheck } from "./origin-check";

/**
 * Every HTTP-level setting, applied by main.ts and by both test apps (B13a), so a test sees the headers, CORS and
 * client address production does. Call before `listen` / `init`.
 */
export function configureHttp(app: INestApplication, env: Pick<Env, "CORS_ORIGIN" | "TRUST_PROXY_HOPS" | "ORIGIN_SECRET">): void {
  // Behind the ALB the socket is the balancer's: read the client from X-Forwarded-For, trusting exactly this many hops.
  // The rate limits key on req.ip (auth/rate-limit.ts, signups.service.ts). Every request has come through Vercel
  // (the origin lock below, and the ALB's rule), so a caller can't add hops of its own by skipping it.
  (app as NestExpressApplication).set("trust proxy", env.TRUST_PROXY_HOPS);
  // The API serves JSON, plain-text errors, redirects and (locally) file bytes; it never serves a page, so nothing may
  // run or frame from it. CORP same-site: the web reads files through its own /api proxy (apps/web/src/middleware.ts).
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
      frameguard: { action: "deny" }, // agrees with frame-ancestors 'none'
    }),
  );
  // #2: outside APP_ENV=local (env.ts requires ORIGIN_SECRET there) only the web's /api proxy gets in. Before every
  // route and module middleware, so a refused request costs nothing more.
  if (env.ORIGIN_SECRET) app.use(originCheck(env.ORIGIN_SECRET));
  app.setGlobalPrefix("api");
  // Exact origins only (env.ts refuses "*" and paths); credentials for the httpOnly session cookies.
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: true });
}
