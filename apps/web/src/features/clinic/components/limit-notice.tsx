import { InfoIcon } from "lucide-react";
import { canAddUnder, limitMessage, type ClinicUsage } from "@pedia/shared";

/**
 * At a limit, say so before the button is pressed (decision #8): the limit and "Contact Primolar to upgrade". Over
 * it after a downgrade, the same words: what exists keeps working (#9). Nothing when there is room.
 */
export function LimitNotice({ usage, limit }: { usage: ClinicUsage; limit: "branches" | "staffLogins" }) {
  if (canAddUnder(usage.tier, limit, usage[limit].inUse)) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-info-line bg-info-bg p-3 text-sm text-info">
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      {limitMessage(usage.tier, limit)}
    </p>
  );
}
