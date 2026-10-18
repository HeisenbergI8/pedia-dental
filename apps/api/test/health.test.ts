import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { loadEnv } from "../src/config/env";
import { READY_TIMEOUT_MS } from "../src/health/health.controller";
import { Readiness } from "../src/health/readiness";
import { configureHttp } from "../src/http-setup";
import { PrismaService } from "../src/prisma/prisma.service";

const prisma = { $queryRaw: vi.fn(), $disconnect: async () => {} };

describe("the liveness and readiness probes (B13a Phase 3)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const env = loadEnv({ DATABASE_URL: "mysql://unused", LOG_LEVEL: "silent" });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).overrideProvider(PrismaService).useValue(prisma).compile();
    app = moduleRef.createNestApplication();
    configureHttp(app, env);
    await app.init();
  });
  afterAll(() => app.close());
  const get = (path: string) => request(app.getHttpServer()).get(path); // no cookie: every probe is public

  it("live never touches the database", async () => {
    prisma.$queryRaw.mockClear();
    const res = await get("/api/health/live");
    expect([res.status, res.body]).toEqual([200, { status: "ok" }]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("ready answers 503 within its bound when the database hangs, 200 when it answers", async () => {
    prisma.$queryRaw.mockImplementation(() => new Promise(() => {}));
    for (const path of ["/api/health/ready", "/api/health"]) {
      const started = performance.now();
      const res = await get(path);
      expect([res.status, res.text]).toEqual([503, "The database is unreachable."]);
      expect(performance.now() - started).toBeLessThan(READY_TIMEOUT_MS + 500);
    }
    prisma.$queryRaw.mockResolvedValue([{ 1: 1 }]);
    const ok = await get("/api/health/ready");
    expect([ok.status, ok.body]).toEqual([200, { status: "ok", database: "up" }]);
  }, 10_000);

  it("ready answers 503 while draining; live still 200", async () => {
    app.get(Readiness).draining = true;
    const ready = await get("/api/health/ready");
    expect([ready.status, ready.text]).toEqual([503, "Shutting down."]);
    expect((await get("/api/health/live")).status).toBe(200);
    app.get(Readiness).draining = false;
  });
});
