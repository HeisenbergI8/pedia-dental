import { ALL_BRANCHES, TIER_LIMITS, reportBranchFilter, type Branch, type Role, type Tier } from "@pedia/shared";
import type { Refusal } from "../common/refusal";

/**
 * The branches a report covers (mocks/access.ts reportBranches, decision #20): absent or the device's branch → it;
 * `all` → every branch of the account, archived included (#22), for the Owner; another id → it, when the caller works
 * there. Wider than the device's branch needs a tier with cross-branch views (#6). B8's /reports/finance reuses it.
 */
export function reportBranches(asked: string | undefined, device: Branch, tier: Tier, roles: readonly Role[], usable: Branch[], every: Branch[]): string[] | Refusal {
  if (!asked || asked === device.id) return [device.id];
  const no = (message: string): Refusal => ({ status: 403, message });
  if (!TIER_LIMITS[tier].crossBranchViews) return no("Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade.");
  const filter = reportBranchFilter(tier, roles, usable);
  if (!filter) return no("Reports across branches need two open branches you work at");
  if (asked === ALL_BRANCHES) return filter.all ? every.map((b) => b.id) : no("Only the clinic's Owner sees all branches together");
  return filter.branches.some((b) => b.id === asked) ? [asked] : no("You don't work at that branch");
}
