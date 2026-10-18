import { Injectable } from "@nestjs/common";
import { AccountOverview, TIER_LIMITS, manilaMonth, termsOutdated, type AgreementRecord } from "@pedia/shared";
import { Prisma } from "../generated/prisma/client.ts";
import { Clock } from "../common/clock";
import { PrismaService } from "../prisma/prisma.service";
import { UsageService } from "../usage/usage.service";

type OwnerRow = { clinicId: string; id: string; fullName: string; email: string | null };
type CountRow = { clinicId: string; n: bigint | number };

/**
 * GET /operator/accounts' rows (decision #25): counts only, never a record. One read of the accounts, then one query per
 * measure across every clinic asked for (raw `GROUP BY` or `IN`: the operator has no clinic, and no N+1). Each parses
 * with the strict `AccountOverview`, so a stray field fails here instead of reaching the console.
 */
@Injectable()
export class AccountOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly usage: UsageService,
  ) {}

  /** The accounts asked for, in that order; unknown ids are left out. */
  async of(clinicIds: readonly string[]): Promise<AccountOverview[]> {
    if (clinicIds.length === 0) return [];
    const ids = Prisma.join([...clinicIds]);
    const accounts = await this.prisma.clinicAccount.findMany({ where: { id: { in: [...clinicIds] } } });
    const owners = await this.prisma.$queryRaw<OwnerRow[]>`SELECT clinicId, id, fullName, email FROM Staff WHERE clinicId IN (${ids}) AND isOwner = true`;
    const unconsented = await this.prisma.$queryRaw<CountRow[]>`
      SELECT p.clinicId, COUNT(*) AS n FROM Patient p
      LEFT JOIN PatientPrivacyConsent c ON c.clinicId = p.clinicId AND c.patientId = p.id
      WHERE p.clinicId IN (${ids}) AND c.patientId IS NULL GROUP BY p.clinicId`;
    const agreements = await this.prisma.agreement.findMany({ where: { clinicId: { in: [...clinicIds] } }, orderBy: [{ at: "desc" }, { id: "desc" }] });
    const designs = await this.prisma.signup.findMany({ where: { clinicId: { in: [...clinicIds] } }, select: { clinicId: true, designStatus: true } });
    const counts = await this.usage.forClinics(clinicIds, manilaMonth(this.clock.today()));

    return clinicIds.flatMap((id) => {
      const a = accounts.find((x) => x.id === id);
      if (!a) return [];
      const owner = owners.find((o) => o.clinicId === id);
      const latest = agreements.find((g) => g.clinicId === id);
      const agreement: AgreementRecord | null = latest
        ? {
            termsVersion: latest.termsVersion, dpaVersion: latest.dpaVersion, acceptedBy: latest.acceptedBy, at: latest.at.toISOString(), method: latest.method,
            ...(latest.signedOn && { signedOn: latest.signedOn.toISOString().slice(0, 10) }),
          }
        : null;
      const design = designs.find((d) => d.clinicId === id)?.designStatus ?? null;
      const c = counts.get(id)!;
      return [
        AccountOverview.parse({
          account: { id: a.id, name: a.name, contactEmail: a.contactEmail, tier: a.tier, status: a.status },
          owner: owner ? { staffId: owner.id, name: owner.fullName, email: owner.email ?? "" } : null,
          usage: {
            branches: c.branches, staffLogins: c.staffLogins, patients: c.patients,
            storage: { inUse: c.storageBytes, limit: TIER_LIMITS[a.tier].storageBytes },
            texts: { inUse: c.textParts, limit: TIER_LIMITS[a.tier].textParts },
          },
          design,
          look: design ? { brandColor: a.brandColor, headingFont: a.headingFont ?? null, hasLogo: !!a.logoRef } : null,
          privacy: {
            agreement,
            current: !termsOutdated(agreement ?? undefined),
            patientsWithoutConsent: Number(unconsented.find((u) => u.clinicId === id)?.n ?? 0),
          },
        }),
      ];
    });
  }

  /** Every account, by name. */
  async all(): Promise<AccountOverview[]> {
    const ids = (await this.prisma.clinicAccount.findMany({ select: { id: true, name: true } })).sort((a, b) => a.name.localeCompare(b.name)).map((a) => a.id);
    return this.of(ids);
  }
}
