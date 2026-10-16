import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../src/prisma/prisma.service";
import { createIntApp } from "./support/int-app";

describe("the API on a real database", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createIntApp();
  });
  afterAll(() => app.close());

  it("reports the database up", async () => {
    const res = await request(app.getHttpServer()).get("/api/health");
    expect([res.status, res.body]).toEqual([200, { status: "ok", database: "up" }]);
  });

  it("has every committed migration applied, none failed", async () => {
    const rows = await app.get(PrismaService).$queryRaw<{ name: string; ok: number }[]>`
      SELECT migration_name AS name, finished_at IS NOT NULL AS ok FROM _prisma_migrations`;
    expect(rows.map((r) => r.name)).toContain("20261016000000_audit_events");
    expect(rows.every((r) => Number(r.ok) === 1)).toBe(true);
  });
});
