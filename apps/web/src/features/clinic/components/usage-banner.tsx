"use client";
import { AlertTriangleIcon, MessageSquareWarningIcon } from "lucide-react";
import Link from "next/link";
import { textAllowanceNotice, type ClinicUsage } from "@pedia/shared";
import { useCan } from "@/features/auth/access";
import { useClinicUsage } from "../api";

/** B12 decision 3: at 80% of the month's texts a notice, at 100% an alert. An icon and words, never colour alone. */
export function TextAllowanceNotice({ usage, link = false }: { usage: ClinicUsage; link?: boolean }) {
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
        {link && (
          <>
            {" "}
            <Link href="/settings?tab=plan" className="font-semibold underline underline-offset-2">
              See Settings → Plan
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

/** Above every page, for the Owner only (as BillingBanner): the month's texts nearly or fully used. */
export function UsageBanner() {
  const owner = useCan()("clinic.manage");
  const usage = useClinicUsage(owner);
  if (!owner || !usage.data || !textAllowanceNotice(usage.data.texts, usage.data.month)) return null;
  return (
    <div className="mb-5 print:hidden">
      <TextAllowanceNotice usage={usage.data} link />
    </div>
  );
}
