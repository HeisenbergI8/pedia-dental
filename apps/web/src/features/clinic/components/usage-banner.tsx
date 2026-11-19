"use client";
import { AlertTriangleIcon, MessageSquareWarningIcon } from "lucide-react";
import Link from "next/link";
import { TOPUP_PAUSED, textAllowanceNotice, type ClinicUsage } from "@pedia/shared";
import { useCan } from "@/features/auth/access";
import { useClinicUsage, useSubscription } from "../api";
import { BUY_TEXTS_ID } from "./text-topup-card";

/** B12 decision 3: at 80% of the month's texts a notice, at 100% an alert. An icon and words, never colour alone. */
/** `canBuy`: false while the clinic is paused for its monthly fee (D8): then the notice says to pay first. */
export function TextAllowanceNotice({ usage, link = false, canBuy = true }: { usage: ClinicUsage; link?: boolean; canBuy?: boolean }) {
  const notice = textAllowanceNotice(usage.texts, usage.month);
  if (!notice) return null;
  const limit = notice.level === "limit";
  const Icon = limit ? AlertTriangleIcon : MessageSquareWarningIcon;
  return (
    <p
      role={limit ? "alert" : "status"}
      className={
        limit
          ? "flex gap-2.5 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-warning"
          : "flex gap-2.5 rounded-lg border border-line px-4 py-3 text-sm"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {notice.text}
        {" "}
        {/* D13: a top-up any time; on Settings → Plan the card is on the same page. */}
        {canBuy ? (
          <Link href={link ? `/settings?tab=plan#${BUY_TEXTS_ID}` : `#${BUY_TEXTS_ID}`} className="font-semibold underline underline-offset-2">
            Buy more texts
          </Link>
        ) : (
          TOPUP_PAUSED
        )}
      </span>
    </p>
  );
}

/** Above every page, for the Owner only (as BillingBanner): the month's texts nearly or fully used. */
export function UsageBanner() {
  const owner = useCan()("clinic.manage");
  const usage = useClinicUsage(owner);
  const sub = useSubscription(owner);
  if (!owner || !usage.data || !textAllowanceNotice(usage.data.texts, usage.data.month)) return null;
  return (
    <div className="mb-5 print:hidden">
      <TextAllowanceNotice usage={usage.data} link canBuy={!sub.data?.pausedFor} />
    </div>
  );
}
