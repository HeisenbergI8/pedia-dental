import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, RateLimitService } from "../../src/auth/rate-limit";
import { passwordBucket } from "../../src/auth/auth.service";
import { FixedClock } from "../../src/common/clock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

const clock = new FixedClock(new Date("2026-10-16T02:01:00Z"));
let a: INestApplication;
let b: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  [a, b] = await Promise.all([createIntApp({ clock }), createIntApp({ clock })]);
  prisma = a.get(PrismaService);
  await resetDatabase(prisma);
});
afterAll(async () => { await Promise.all([a.close(), b.close()]); });
beforeEach(async () => {
  await prisma.rateLimitCounter.deleteMany();
  clock.set(new Date("2026-10-16T02:01:00Z"));
});

/** A different unknown login each time unless one is named, so the per-login lock (security review #7) never decides the address limit. */
let n = 0;
const signIn = (app: INestApplication, email = `nobody${n++}@example.com`) => request(app.getHttpServer()).post("/api/auth/login").send({ email, password: "x" });

describe("rate limits on MySQL (CHUNKS B2)", () => {
  it("shares one sign-in limit across two instances, then refuses on both until the window ends", async () => {
    for (let i = 0; i < RATE_LIMITS.login.hits; i++) expect((await signIn(i % 2 ? a : b)).status).toBe(401);
    const refused = await signIn(a);
    expect([refused.status, refused.headers["retry-after"]]).toEqual([429, "240"]);
    expect((await signIn(b)).status).toBe(429);
    expect((await request(a.getHttpServer()).get("/api/auth/me")).status).toBe(401); // other routes count separately
    clock.set(new Date("2026-10-16T02:05:00Z"));
    expect((await signIn(b)).status).toBe(401); // a new window
  }, 60_000);

  it("counts concurrent hits exactly", async () => {
    const limits = a.get(RateLimitService);
    const results = await Promise.all(Array.from({ length: 30 }, () => limits.hit("login:concurrent", RATE_LIMITS.login)));
    expect(results.filter((r) => r.allowed)).toHaveLength(RATE_LIMITS.login.hits);
    const [row] = await prisma.$queryRaw<{ hits: number }[]>`SELECT hits FROM RateLimitCounter WHERE bucket = 'login:concurrent'`;
    expect(Number(row!.hits)).toBe(30);
  });

  it("locks one login after five wrong passwords on either instance, then for twice as long after each further one (security review #7)", async () => {
    const ghost = "ghost@example.com";
    for (let i = 0; i < 5; i++) expect((await signIn(i % 2 ? a : b, ghost)).status).toBe(401);
    const locked = await signIn(a, ghost);
    expect([locked.status, locked.text]).toEqual([429, "Too many wrong passwords. Try again in 1 minute."]);
    expect((await signIn(b)).status).toBe(401); // another login is untouched
    clock.set(new Date("2026-10-16T02:02:01Z")); // the 1-minute lock has ended: one more try
    expect((await signIn(b, ghost)).status).toBe(401);
    expect((await signIn(a, ghost)).text).toBe("Too many wrong passwords. Try again in 2 minutes.");
    clock.set(new Date("2026-10-16T02:04:02Z"));
    expect((await signIn(a, ghost)).status).toBe(401);
    expect((await signIn(b, ghost)).text).toBe("Too many wrong passwords. Try again in 4 minutes.");
    const buckets = (await prisma.rateLimitCounter.findMany({ where: { bucket: { startsWith: "signin:" } }, select: { bucket: true } })).map((r) => r.bucket);
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.filter((b) => b.includes("ghost") || !/^signin:[0-9a-f]{64}$/.test(b))).toEqual([]); // only a hash of the login
  }, 60_000);

  it("counts parallel password tries on one login exactly, and forgets them on the right password", async () => {
    const limits = a.get(RateLimitService);
    const bucket = passwordBucket("clinic", "parallel@example.com");
    const results = await Promise.all(Array.from({ length: 12 }, () => limits.tryPassword(bucket)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    await limits.passwordRight(bucket);
    expect((await limits.tryPassword(bucket)).allowed).toBe(true);
  });

  it("counts PIN tries per session over the session's life (security review #9)", async () => {
    const limits = a.get(RateLimitService);
    const hits = [];
    for (let i = 0; i < 6; i++) hits.push((await limits.hitRolling("pins:session-under-test", RATE_LIMITS.pins)).hits);
    expect(hits).toEqual([1, 2, 3, 4, 5, 6]);
    clock.set(new Date("2026-10-16T10:02:00Z")); // past the 8-hour window
    expect((await limits.hitRolling("pins:session-under-test", RATE_LIMITS.pins)).hits).toBe(1);
  });
});
