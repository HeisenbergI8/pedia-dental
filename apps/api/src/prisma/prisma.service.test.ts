import { afterAll, describe, expect, it } from "vitest";
import { requestContext } from "../common/request-context";
import { loadEnv } from "../config/env";
import { PrismaService } from "./prisma.service";

const prisma = new PrismaService(loadEnv({ DATABASE_URL: "mysql://u:p@127.0.0.1:1/none", LOG_LEVEL: "silent" }));
afterAll(() => prisma.onModuleDestroy());

describe("PrismaService (no database)", () => {
  it("keeps its Nest lifecycle hook after the extension", () => {
    expect(typeof prisma.onModuleDestroy).toBe("function");
  });

  it("refuses a tenant query with no clinic before it reaches the database", async () => {
    await expect(prisma.auditEvent.findMany()).rejects.toThrow(/needs a clinic/);
  });

  it("refuses to change an audit entry even inside a clinic", async () => {
    const ctx = { requestId: "r1", clinicId: "clinic_a", operator: false };
    await expect(
      requestContext.run(ctx, () => prisma.auditEvent.update({ where: { id: "a1" }, data: { record: "x" } })),
    ).rejects.toThrow(/append-only/);
  });
});
