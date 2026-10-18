import { type INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../../test/support/test-app";
import type { PrismaService } from "../prisma/prisma.service";
import { MetricsService, NAMESPACE } from "./metrics.service";

const prisma = (rows: unknown[] = []) => ({ $queryRaw: async () => rows }) as unknown as PrismaService;
const NOW = new Date("2026-10-19T00:00:00Z");
type Line = { _aws: { Timestamp: number; CloudWatchMetrics: { Namespace: string; Dimensions: string[][]; Metrics: { Name: string; Unit: string }[] }[] } } & Record<string, unknown>;

describe("the metrics lines (B13a Step 4.1)", () => {
  it("writes totals and per-route latency as EMF, then starts a new interval", async () => {
    const metrics = new MetricsService(prisma(), false);
    for (const status of [200, 200, 503]) metrics.observe("GET /api/reports/today", status, 12.4);
    metrics.observe("GET /api/health", 200, 1);
    const [totals, route, extra] = (await metrics.flush(NOW)) as Line[];
    expect(totals).toMatchObject({ Service: "api", Requests: 4, ServerErrors: 1, UnhandledErrors: 0 });
    expect(totals!._aws).toMatchObject({ Timestamp: NOW.getTime(), CloudWatchMetrics: [{ Namespace: NAMESPACE, Dimensions: [["Service"]] }] });
    expect(route).toMatchObject({ Route: "GET /api/reports/today", LatencyMs: [12, 12, 12] });
    expect(route!._aws.CloudWatchMetrics[0]!.Metrics).toEqual([{ Name: "LatencyMs", Unit: "Milliseconds" }]);
    expect(extra).toBeUndefined();
    const next = (await metrics.flush(NOW)) as Line[];
    expect([next.length, next[0]!.Requests]).toEqual([1, 0]);
  });

  it("keeps at most 100 latency samples per route", async () => {
    const metrics = new MetricsService(prisma(), false);
    for (let i = 0; i < 250; i++) metrics.observe("POST /api/appointments", 201, i);
    expect(((await metrics.flush(NOW))[1] as Line).LatencyMs).toHaveLength(100);
  });

  it("reports the outbox backlog on the background instance", async () => {
    const metrics = new MetricsService(prisma([{ due: 2n, oldest: new Date(NOW.getTime() - 90_000) }]), true);
    const [totals] = (await metrics.flush(NOW)) as Line[];
    expect(totals).toMatchObject({ OutboxDue: 2, OutboxOldestSeconds: 90 });
    expect(totals!._aws.CloudWatchMetrics[0]!.Metrics).toContainEqual({ Name: "OutboxOldestSeconds", Unit: "Seconds" });
  });

  describe("through the app", () => {
    let app: INestApplication;
    afterAll(() => app.close());
    it("counts every request and labels it by route template, never the raw id", async () => {
      app = await createTestApp({ openGuard: true });
      const metrics = app.get(MetricsService);
      await metrics.flush();
      const observe = vi.spyOn(metrics, "observe");
      const server = app.getHttpServer();
      await request(server).get("/api/health");
      await request(server).get("/api/health");
      await request(server).get("/api/patients/abc");
      await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(3));
      expect(observe.mock.calls[2]![0]).toBe("GET /api/patients/:id");
      expect(((await metrics.flush())[0] as Line).Requests).toBe(3);
    });
  });
});
