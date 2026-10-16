import { DEMO_PASSWORD, OPERATORS, accountsByEmail, demoLogins, seedPlatform } from "@pedia/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
const hasher = new Hasher();
const platform = seedPlatform();

beforeAll(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => prisma.onModuleDestroy());

describe("prisma db seed (seedDatabase) on MySQL", () => {
  it("writes every clinic account, and each clinic's branches and staff under its own clinicId", async () => {
    expect(await prisma.clinicAccount.count()).toBe(platform.accounts.length);
    for (const { id } of platform.accounts) {
      expect(await inClinic(id, () => prisma.branch.count())).toBe(platform.tenants[id]!.branches.length);
      expect(await inClinic(id, () => prisma.staff.count())).toBe(platform.tenants[id]!.staff.length);
    }
  });

  it("gives every mock login the same email in the same clinics, opened by the demo password", async () => {
    for (const { email } of demoLogins(platform)) {
      const rows = await prisma.credential.findMany({ where: { email }, select: { clinicId: true, passwordHash: true } });
      expect(rows.map((r) => r.clinicId).sort()).toEqual(accountsByEmail(platform, email).map((m) => m.clinicId).sort());
      expect(await hasher.matches(rows[0]!.passwordHash, DEMO_PASSWORD)).toBe(true);
    }
  });

  it("stores PINs only as hashes, and the operator outside every clinic", async () => {
    const withPin = await prisma.credential.findMany({ where: { pinHash: { not: null } }, select: { pinHash: true } });
    expect(withPin.length).toBeGreaterThan(0);
    expect(withPin.every((c) => c.pinHash!.startsWith("$argon2id$"))).toBe(true);
    expect((await prisma.operatorUser.findMany()).map((o) => o.email)).toEqual(OPERATORS.map((o) => o.email));
  });

  it("lists the login page's featured logins, one per email", async () => {
    const featured = await prisma.demoLogin.findMany({ where: { featured: true }, select: { email: true } });
    expect(new Set(featured.map((f) => f.email))).toEqual(new Set(demoLogins(platform).map((l) => l.email)));
  });

  it("refuses to run twice", async () => {
    await expect(seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, platform)).rejects.toThrow(/already exist/);
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM ClinicAccount`;
    expect(Number(row!.n)).toBe(platform.accounts.length);
  });
});
