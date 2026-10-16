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

  // Prisma queries are lazy: each one is awaited inside `run`, or it would execute outside the context.
  const inClinicA = <T>(fn: () => Promise<T>) =>
    requestContext.run({ requestId: "r1", clinicId: "clinic_a", operator: false }, async () => await fn());

  it("sees the clinic in context: a query naming another clinic is refused as a mismatch", async () => {
    await expect(inClinicA(() => prisma.auditEvent.findMany({ where: { clinicId: "clinic_b" } }))).rejects.toThrow(
      /doesn't match the request context/,
    );
  });

  it("refuses to change an audit entry even inside a clinic", async () => {
    await expect(
      inClinicA(() => prisma.auditEvent.update({ where: { id: "a1" }, data: { record: "x" } })),
    ).rejects.toThrow(/append-only/);
  });
});
