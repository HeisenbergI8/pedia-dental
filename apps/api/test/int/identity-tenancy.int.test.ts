import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { inClinic, resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
afterAll(() => prisma.onModuleDestroy());
beforeEach(() => resetDatabase(prisma));

const hours = { opensAt: 480, closesAt: 1080, closedWeekdays: [0] };
const branch = (name: string) => ({ name, address: "1 Main St", phone: "(046) 471 2580", openingHours: hours });
const staff = (fullName: string, branchIds: string[]) => ({ fullName, role: "dentist" as const, alsoRoles: [], branchIds, email: `${fullName}@x.demo` });

describe("identity tables against MySQL", () => {
  it("never mixes two clinics' branches or staff", async () => {
    await inClinic("clinic_a", async () => {
      await prisma.branch.create({ data: { clinicId: "clinic_a", ...branch("Imus") } });
      await prisma.staff.create({ data: { clinicId: "clinic_a", ...staff("ana", ["b1"]) } });
    });
    await inClinic("clinic_b", () => prisma.branch.createMany({ data: [{ clinicId: "clinic_b", ...branch("Dasma") }, { clinicId: "clinic_b", ...branch("Bacoor") }] }));

    expect((await inClinic("clinic_a", () => prisma.branch.findMany())).map((b) => b.name)).toEqual(["Imus"]);
    expect(await inClinic("clinic_b", () => prisma.staff.count())).toBe(0);
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM Branch`;
    expect(Number(row!.n)).toBe(3); // raw SQL counts arrive as bigint
  });

  it("keeps Json columns as written (branchIds, openingHours)", async () => {
    const row = await inClinic("clinic_a", () => prisma.staff.create({ data: { clinicId: "clinic_a", ...staff("ben", ["b1", "b2"]) } }));
    expect(row.branchIds).toEqual(["b1", "b2"]);
    expect((await inClinic("clinic_a", () => prisma.branch.create({ data: { clinicId: "clinic_a", ...branch("Imus") } }))).openingHours).toEqual(hours);
  });

  it("refuses to change an acknowledgement or a privacy notice", async () => {
    const ack = { kind: "confidentiality" as const, version: 1, accountId: "staff_a", name: "Ana", at: new Date() };
    await inClinic("clinic_a", () => prisma.acknowledgement.create({ data: { clinicId: "clinic_a", ...ack } }));
    await expect(inClinic("clinic_a", () => prisma.acknowledgement.deleteMany())).rejects.toThrow(/append-only/);
    await expect(inClinic("clinic_a", () => prisma.privacyNotice.updateMany({ data: { body: "x" } }))).rejects.toThrow(/append-only/);
  });

  it("refuses two notices with the same version in one clinic, allows it across clinics", async () => {
    const notice = { version: 1, body: "b", contactName: "c", contactEmail: "c@x.ph", savedByName: "s", at: new Date() };
    await inClinic("clinic_a", () => prisma.privacyNotice.create({ data: { clinicId: "clinic_a", ...notice } }));
    await inClinic("clinic_b", () => prisma.privacyNotice.create({ data: { clinicId: "clinic_b", ...notice } }));
    await expect(inClinic("clinic_a", () => prisma.privacyNotice.create({ data: { clinicId: "clinic_a", ...notice } }))).rejects.toThrow();
  });

  it("finds a login's credentials by email across clinics, with no clinic in context (platform table)", async () => {
    const cred = (clinicId: string) => ({ clinicId, accountId: "staff_x", email: "dentist@gmail.com", staffId: "staff_x", name: "", passwordHash: "h", pinFailedAt: [] });
    await prisma.credential.createMany({ data: [cred("clinic_a"), cred("clinic_b")] });
    expect((await prisma.credential.findMany({ where: { email: "dentist@gmail.com" } })).map((c) => c.clinicId).sort()).toEqual(["clinic_a", "clinic_b"]);
    await expect(prisma.credential.create({ data: cred("clinic_a") })).rejects.toThrow(); // one per login per clinic
  });
});
