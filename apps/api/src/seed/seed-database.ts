import { DEMO_PASSWORD, OPERATORS, allAccounts, demoAccounts, demoLogins, staffEmail, type Platform } from "@pedia/seed";
import { requestContext } from "../common/request-context";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { Hasher } from "../auth/hashing";

export class SeedRefused extends Error {
  override name = "SeedRefused";
}

/** Demo data only on a demo deployment, and never on top of real data. */
export function assertSeedAllowed(env: Pick<Env, "DEMO_LOGINS">, existingAccounts: number): void {
  if (!env.DEMO_LOGINS) throw new SeedRefused("Refusing to seed: set DEMO_LOGINS=true (demo deployments only).");
  if (existingAccounts > 0) {
    throw new SeedRefused(`Refusing to seed: ${existingAccounts} clinic account(s) already exist. Reset first (prisma migrate reset).`);
  }
}

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Writes `seedPlatform()`'s identity data: accounts, branches, staff, every login's credentials (argon2id), notices,
 * acknowledgements, agreements, the operator and the login page's DemoLogin rows. Clinic rows are written inside that
 * clinic's request context, so the tenant extension stamps and checks them (awaited inside, CONVENTIONS → Traps).
 * Patients, visits and the rest arrive with their chunks.
 */
export async function seedDatabase(prisma: PrismaService, hasher: Hasher, env: Pick<Env, "DEMO_LOGINS">, platform: Platform): Promise<void> {
  assertSeedAllowed(env, await prisma.clinicAccount.count());
  // Every demo login shares the public demo password: hash it once (argon2 is slow on purpose).
  const demoHash = await hasher.hash(DEMO_PASSWORD);
  const featured = new Set(demoLogins(platform).map((l) => l.email));

  await prisma.clinicAccount.createMany({
    data: platform.accounts.map(({ id, name, logoRef, contactEmail, tin, tier, status, brandColor, headingFont }) => ({
      id, name, logoRef, contactEmail, tin, tier, status, brandColor, headingFont,
    })),
  });
  await prisma.agreement.createMany({
    data: platform.agreements.map(({ signedOn, at, ...a }) => ({ ...a, at: new Date(at), signedOn: signedOn ? dateOnly(signedOn) : null })),
  });
  await prisma.operatorUser.createMany({ data: OPERATORS.map((o) => ({ ...o, passwordHash: demoHash })) });

  for (const { id: clinicId } of platform.accounts) {
    const db = platform.tenants[clinicId]!;
    const credentials = await Promise.all(
      allAccounts(db).map(async (a) => {
        const own = a.staffId ? db.staffCredentials.find((c) => c.staffId === a.staffId) : undefined;
        const pin = a.staffId ? db.staffPins.find((p) => p.staffId === a.staffId) : undefined;
        return {
          clinicId, accountId: a.id, email: a.email, staffId: a.staffId ?? null, guardianId: a.guardianId ?? null, name: a.name,
          passwordHash: own ? await hasher.hash(own.password) : demoHash,
          mustChange: own?.mustChange ?? false,
          pinHash: pin ? await hasher.hash(pin.pin) : null,
          pinFailedAt: pin?.failedAt ?? [],
        };
      }),
    );
    await prisma.credential.createMany({ data: credentials });
    await prisma.demoLogin.createMany({
      data: demoAccounts(db).map((a, position) => ({
        clinicId, accountId: a.id, role: a.role, name: a.name, email: a.email, summary: a.summary, pin: a.pin ?? null, position,
        featured: featured.has(a.email),
      })),
    });

    await requestContext.run({ requestId: `seed-${clinicId}`, clinicId, operator: false }, async () => {
      await prisma.branch.createMany({ data: db.branches.map(({ id, name, address, phone, openingHours, archived }) => ({ id, clinicId, name, address, phone, openingHours, archived })) });
      await prisma.staff.createMany({
        data: db.staff.map((s) => ({
          id: s.id, clinicId, fullName: s.fullName, role: s.role, alsoRoles: s.alsoRoles ?? [], isOwner: s.isOwner ?? false,
          branchIds: s.branchIds, licenseNo: s.licenseNo ?? null, email: staffEmail(s), deactivatedAt: s.deactivatedAt ? new Date(s.deactivatedAt) : null,
        })),
      });
      await prisma.privacyNotice.createMany({ data: db.privacyNotices.map(({ at, ...n }) => ({ ...n, at: new Date(at) })) });
      await prisma.acknowledgement.createMany({ data: db.acknowledgements.map(({ at, ...a }) => ({ ...a, at: new Date(at) })) });
    });
  }
}
