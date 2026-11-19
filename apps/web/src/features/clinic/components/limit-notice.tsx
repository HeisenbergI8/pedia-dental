import { InfoIcon } from "lucide-react";
import { limitMessage, limitTier, type ClinicUsage, type SubscriptionView } from "@pedia/shared";

/** Room for one more under the limit `/clinic/usage` reports: while a downgrade waits, the smaller plan's (B12 E13). */
export const hasRoom = ({ inUse, limit }: ClinicUsage["branches"]) => limit === null || inUse < limit;

/**
 * At a limit, say so before the button is pressed (decision #8): the limit and "Contact Primolar to upgrade". Over
 * it after a downgrade, the same words: what exists keeps working (#9). While a downgrade waits (`downgrade`, from the
 * subscription), the smaller plan already counts, and the words say when the plan moves (bot report #19), as the API's
 * refusal does. Nothing when there is room.
 */
export function LimitNotice({ usage, limit, downgrade }: { usage: ClinicUsage; limit: "branches" | "staffLogins"; downgrade?: SubscriptionView["downgrade"] }) {
  if (hasRoom(usage[limit])) return null;
  const tier = limitTier(usage.tier, downgrade);
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-info-line bg-info-bg p-3 text-sm text-info">
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {limitMessage(tier, limit, tier !== usage.tier ? downgrade?.on : undefined)}
    </p>
  );
}
