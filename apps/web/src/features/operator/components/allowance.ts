import { TIER_LIMITS, type AccountOverview, type Tier } from "@pedia/shared";

type Limit = "branches" | "staffLogins";

/** "2 of 3", "6 (unlimited)". Over the limit after a downgrade reads "2 of 1": nothing is disabled (decision #9). */
export function allowance(tier: Tier, limit: Limit, inUse: number) {
  const max = TIER_LIMITS[tier][limit];
  return { text: max === null ? `${inUse} (unlimited)` : `${inUse} of ${max}`, over: max !== null && inUse > max };
}

/** The limits this account is over on `tier`, in words, for the downgrade note. */
export function overLimits(tier: Tier, usage: AccountOverview["usage"]) {
  const names: Record<Limit, string> = { branches: "branches", staffLogins: "staff logins" };
  return (["branches", "staffLogins"] as const).filter((l) => allowance(tier, l, usage[l]).over).map((l) => `${names[l]} (${allowance(tier, l, usage[l]).text})`);
}
