import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMITS, RateLimitService } from "../../src/auth/rate-limit";
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

const signIn = (app: INestApplication) => request(app.getHttpServer()).post("/api/auth/login").send({ email: "nobody@example.com", password: "x" });

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
});
