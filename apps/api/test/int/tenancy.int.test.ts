import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inClinic, resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
afterAll(() => prisma.onModuleDestroy());
beforeEach(() => resetDatabase(prisma));

const entry = (clinicId: string, actorId: string) => ({
  clinicId, at: new Date(), actorId, actorName: actorId, actorRole: "admin" as const, action: "view" as const, record: "Patient list",
});

describe("tenant scoping against MySQL (B1 done-when)", () => {
  it("never mixes two clinics' rows: each sees only its own, though both are stored", async () => {
    await inClinic("clinic_a", () => prisma.auditEvent.create({ data: entry("clinic_a", "staff_a") }));
    await inClinic("clinic_b", () => prisma.auditEvent.createMany({ data: [entry("clinic_b", "staff_b"), entry("clinic_b", "staff_c")] }));

    expect((await inClinic("clinic_a", () => prisma.auditEvent.findMany())).map((r) => r.actorId)).toEqual(["staff_a"]);
    expect(await inClinic("clinic_b", () => prisma.auditEvent.count())).toBe(2);
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM AuditEvent`;
    expect(Number(row!.n)).toBe(3);
  });

  it("finds nothing of another clinic's by its id", async () => {
    const row = await inClinic("clinic_a", () => prisma.auditEvent.create({ data: entry("clinic_a", "staff_a") }));
    expect(await inClinic("clinic_b", () => prisma.auditEvent.findUnique({ where: { id: row.id } }))).toBeNull();
    expect(await inClinic("clinic_a", () => prisma.auditEvent.findUnique({ where: { id: row.id } }))).not.toBeNull();
  });

  it("refuses a tenant query with no clinic before MySQL sees it", async () => {
    await expect(prisma.auditEvent.findMany()).rejects.toThrow(/needs a clinic/);
  });

  it("refuses to change an audit entry, and the stored row stays as written", async () => {
    await inClinic("clinic_a", () => prisma.auditEvent.create({ data: entry("clinic_a", "staff_a") }));
    await expect(inClinic("clinic_a", () => prisma.auditEvent.updateMany({ data: { record: "x" } }))).rejects.toThrow(/append-only/);
    expect((await inClinic("clinic_a", () => prisma.auditEvent.findMany()))[0]!.record).toBe("Patient list");
  });
});
