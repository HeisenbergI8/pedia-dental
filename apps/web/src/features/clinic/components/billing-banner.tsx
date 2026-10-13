"use client";
import { AlertTriangleIcon, CalendarClockIcon } from "lucide-react";
import Link from "next/link";
import { subscriptionReminder, type SubscriptionView } from "@pedia/shared";
import { useCan } from "@/features/auth/access";
import { useSubscription } from "../api";

/**
 * The reminder line (billing #32): "due in 3 days", "due today", or overdue with the date to pay by. Nothing when paid
 * up, and nothing once paused (the Owner can't sign in then). An icon and words, never colour alone.
 */
export function BillingNotice({ subscription, link = false }: { subscription: SubscriptionView; link?: boolean }) {
  const text = subscriptionReminder(subscription);
  if (!text) return null;
  const overdue = subscription.state === "overdue";
  const Icon = overdue ? AlertTriangleIcon : CalendarClockIcon;
  return (
    <p
      role="status"
      className={
        overdue
          ? "flex gap-2.5 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-warning"
          : "flex gap-2.5 rounded-lg border border-line px-4 py-3 text-sm"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {text}
        {link && (
          <>
            {" "}
            <Link href="/settings" className="font-semibold underline underline-offset-2">
              See Settings → Plan
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

/**
 * Billing #28, #31, #32, S9: above every page, for the Owner only, while a payment is due soon or overdue. Other staff
 * never ask for the bill (the query is disabled), so they see nothing until the clinic is paused, and then sign-in
 * tells them.
 */
export function BillingBanner() {
  const can = useCan();
  const owner = can("clinic.manage");
  const sub = useSubscription(owner);
  if (!owner || !sub.data || !subscriptionReminder(sub.data)) return null; // paid up: no empty wrapper, no stray margin
  return (
    <div className="mb-5 print:hidden">
      <BillingNotice subscription={sub.data} link />
    </div>
  );
}
