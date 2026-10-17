import { createHash } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { RESET_TEXTS_PER_HOUR } from "@pedia/shared";
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
  // B11 decision 19: reset texts per sign-in value (a number or an email), not per address. Counted by PortalService
  // before it looks the value up, so a refusal says nothing about whether an account exists. A rolling hour (hitRolling).
  reset: { hits: RESET_TEXTS_PER_HOUR, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimit>;
export type RateLimitGroup = keyof typeof RATE_LIMITS;

/** Both sign-in forms count as `login`; every other auth route (me, switch, logout, …) as `auth`. */
export const groupOf = (method: string, path: string): RateLimitGroup =>
  method === "POST" && (path === "/auth/login" || path === "/operator/auth/login") ? "login" : "auth";

export const bucketOf = (group: RateLimitGroup, ip: string) => `${group}:${ip}`.slice(0, 191);
/** A bucket named by what someone typed (a number, an email): only its hash is stored, never the value (B11 audit). */
export const hashedBucketOf = (group: RateLimitGroup, typed: string) => bucketOf(group, createHash("sha256").update(typed).digest("hex"));

/** The row hitRolling locks first, so parallel hits on one bucket are counted one after the other. */
const ROLLING_LOCK_ROW = new Date(0);

/** A counter whose window started this long ago has ended, in every group. */
const LONGEST_WINDOW_MS = Math.max(...Object.values(RATE_LIMITS).map((l) => l.windowSeconds)) * 1000;

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

  /**
   * A rolling window ("3 an hour" stays 3 across a window's edge: B11 decision 19): one counter per minute, summed over
   * the last `windowSeconds`. A hit up to a minute old at the edge may be forgiven early. The bucket's lock row is taken
   * first, so the sum is exact under concurrency.
   */
  async hitRolling(bucket: string, limit: RateLimit): Promise<{ allowed: boolean }> {
    const now = this.clock.now();
    const minute = windowStart(now, 60);
    const since = new Date(now.getTime() - limit.windowSeconds * 1000);
    const hits = await runInTransaction(this.prisma, async (tx) => {
      await tx.$executeRaw`INSERT INTO RateLimitCounter (bucket, windowStart, hits) VALUES (${bucket}, ${ROLLING_LOCK_ROW}, 0) ON DUPLICATE KEY UPDATE hits = 0`;
      await tx.$executeRaw`INSERT INTO RateLimitCounter (bucket, windowStart, hits) VALUES (${bucket}, ${minute}, 1) ON DUPLICATE KEY UPDATE hits = hits + 1`;
      const [row] = await tx.$queryRaw<{ hits: number | bigint | null }[]>`SELECT SUM(hits) AS hits FROM RateLimitCounter WHERE bucket = ${bucket} AND windowStart > ${since}`;
      return Number(row?.hits ?? 0);
    });
    return { allowed: hits <= limit.hits };
  }

  /** Deletes the counters of ended windows (AuthJobs). Indexed on `windowStart`. */
  async sweep(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - LONGEST_WINDOW_MS);
    return (await this.prisma.rateLimitCounter.deleteMany({ where: { windowStart: { lte: cutoff } } })).count;
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
