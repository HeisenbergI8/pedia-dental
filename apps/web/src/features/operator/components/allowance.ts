import { TIER_LIMITS, type Tier } from "@pedia/shared";

type Limit = "branches" | "staffLogins";

/** "2 of 3", "6 (unlimited)". Over the limit after a downgrade reads "2 of 1": nothing is disabled (decision #9). */
export function allowance(tier: Tier, limit: Limit, inUse: number) {
  const max = TIER_LIMITS[tier][limit];
  return { text: max === null ? `${inUse} (unlimited)` : `${inUse} of ${max}`, over: max !== null && inUse > max };
}
