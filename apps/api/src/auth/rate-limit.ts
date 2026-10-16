import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { Clock } from "../common/clock";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { rulePath } from "./access.guard";

export type RateLimit = { hits: number; windowSeconds: number };

/**
 * Per client address. Data, not `if` statements. A clinic's front desk shares one address (NAT), so sign-in allows a
 * busy morning of typos. Passwords are argon2-slow anyway, and PIN guessing has its own per-person lockout (PIN_POLICY).
 */
export const RATE_LIMITS = {
  login: { hits: 20, windowSeconds: 300 },
  auth: { hits: 120, windowSeconds: 60 },
} as const satisfies Record<string, RateLimit>;
export type RateLimitGroup = keyof typeof RATE_LIMITS;

/** Both sign-in forms count as `login`; every other auth route (me, switch, logout, …) as `auth`. */
export const groupOf = (method: string, path: string): RateLimitGroup =>
  method === "POST" && (path === "/auth/login" || path === "/operator/auth/login") ? "login" : "auth";

export const bucketOf = (group: RateLimitGroup, ip: string) => `${group}:${ip}`.slice(0, 191);

/** The start of the fixed window `now` falls in. */
export const windowStart = (now: Date, windowSeconds: number) => new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);

/** Whole seconds until the window ends, at least 1. */
export const retryAfter = (now: Date, limit: RateLimit) =>
  Math.max(1, Math.ceil((windowStart(now, limit.windowSeconds).getTime() + limit.windowSeconds * 1000 - now.getTime()) / 1000));

/** Counts hits in MySQL, so every API instance shares one count per client (CONVENTIONS → Stateless instances). */
@Injectable()
export class RateLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * Counts one hit and says whether it is within the limit. The upsert takes the row's lock until commit, so the SELECT
   * reads this transaction's own count: exact under concurrency. Raw SQL, on a platform table (no tenant scoping to add).
   */
  async hit(bucket: string, limit: RateLimit): Promise<{ allowed: boolean; retryAfter: number }> {
    const now = this.clock.now();
    const start = windowStart(now, limit.windowSeconds);
    const hits = await runInTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`INSERT INTO RateLimitCounter (bucket, windowStart, hits) VALUES (${bucket}, ${start}, 1) ON DUPLICATE KEY UPDATE hits = hits + 1`;
      const [row] = await tx.$queryRaw<{ hits: number | bigint }[]>`SELECT hits FROM RateLimitCounter WHERE bucket = ${bucket} AND windowStart = ${start}`;
      return Number(row!.hits);
    });
    return { allowed: hits <= limit.hits, retryAfter: retryAfter(now, limit) };
  }
}

/** Bound to AuthController and OperatorAuthController (AuthModule.configure), so it runs before the guard and pipes. */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly limits: RateLimitService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const group = groupOf(req.method, rulePath(req.originalUrl));
    const { allowed, retryAfter: wait } = await this.limits.hit(bucketOf(group, req.ip ?? "unknown"), RATE_LIMITS[group]);
    if (allowed) return next();
    const minutes = Math.ceil(wait / 60);
    res.status(429).set("Retry-After", String(wait)).type("text/plain")
      .send(`Too many tries from this device. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
}
