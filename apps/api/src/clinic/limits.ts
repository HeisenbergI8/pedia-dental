import { ConflictException } from "@nestjs/common";
import { TIER_LIMITS, accountUsage, canAddUnder, limitMessage, type ClinicUsage, type Tier } from "@pedia/shared";
import type { Tx } from "../prisma/transaction";

/** The two limits a tier sets (decisions #5, #6). Cross-branch views are a report rule, not a count. */
export type Limit = "branches" | "staffLogins";

/**
 * What counts toward the limits now: accountUsage's rule (decisions #10, #37), open branches and active staff logins,
 * the Owner included, parents never. Pass the transaction's client after lockAccount, or the root client for a read.
 */
export async function countUsage(db: Pick<Tx, "branch" | "staff">): Promise<Record<Limit, number>> {
  const branches = await db.branch.findMany({ select: { archived: true } });
  const staff = await db.staff.findMany({ select: { deactivatedAt: true } });
  return accountUsage({ branches, staff: staff.map((s) => ({ deactivatedAt: s.deactivatedAt?.toISOString() })) });
}

/** GET /clinic/usage: the mock's usage(). `null` limit = unlimited. */
export const usageOf = (tier: Tier, inUse: Record<Limit, number>): ClinicUsage => ({
  tier,
  branches: { inUse: inUse.branches, limit: TIER_LIMITS[tier].branches },
  staffLogins: { inUse: inUse.staffLogins, limit: TIER_LIMITS[tier].staffLogins },
});

/** The refusal when one more would go over the limit, else undefined. Only ever blocks the next one (decision #9). */
export const limitRefusal = (tier: Tier, limit: Limit, inUse: number): string | undefined =>
  canAddUnder(tier, limit, inUse) ? undefined : limitMessage(tier, limit);

/**
 * 409 with the limit's words when the clinic is full. Call it inside runInTransaction, after lockAccount, right before
 * the insert or reactivation it guards: the lock makes count-then-write one step per clinic (B3, Decision 4).
 */
export async function assertRoomFor(tx: Tx, clinicId: string, limit: Limit): Promise<void> {
  const { tier } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
  const refused = limitRefusal(tier, limit, (await countUsage(tx))[limit]);
  if (refused) throw new ConflictException(refused);
}
