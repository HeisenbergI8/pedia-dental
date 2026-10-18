"use client";
import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  SUBSCRIPTION_STATE_LABEL, TIER_LABEL, TIER_LIMITS, formatBillingDate, formatPeso, formatStorage, type ClinicUsage, type SubscriptionView,
} from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { PayByQr } from "@/features/payments/components/pay-by-qr";
import { ReceiptList } from "@/features/payments/components/receipt-list";
import { ReceiptUpload } from "@/features/payments/components/receipt-upload";
import { clinicReceiptImageUrl, useClinicUsage, useSubscription, useUploadReceipt } from "../api";
import { BillingNotice } from "./billing-banner";
import { TextAllowanceNotice } from "./usage-banner";
import { PaymentHistory } from "./payment-history";

/**
 * Read-only: Primolar changes the plan (billing #27). What is in use against the plan, what it includes, and the
 * Owner's billing (#31): next due date and amount, reminders, payment history and invoices.
 */
export function PlanPanel() {
  const usage = useClinicUsage();
  if (usage.isLoading) return <Loading label="Loading your plan" />;
  if (!usage.data) return <ErrorState what="your plan" onRetry={() => void usage.refetch()} />;
  const { tier } = usage.data;
  const limits = TIER_LIMITS[tier];

  return (
    <div className="space-y-5">
      <SectionCard
        title={<>You&apos;re on the {TIER_LABEL[tier]} plan</>}
        description="To change your plan, contact Primolar. An upgrade starts at once; a downgrade starts on your next due date."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Allowance label="Open branches" allowance={usage.data.branches} />
          <Allowance label="Staff logins" allowance={usage.data.staffLogins} />
          <Allowance label="Storage" allowance={usage.data.storage} show={formatStorage} />
          <Allowance label={`Texts in ${format(parseISO(`${usage.data.month}-01`), "MMMM")}`} allowance={usage.data.texts} />
        </div>
        <TextAllowanceNotice usage={usage.data} />
        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Also on your plan</h3>
          <ul className="space-y-1 text-sm">
            <Feature on>Your logo, brand colour and heading font</Feature>
            <Feature on={limits.crossBranchViews}>Dashboard and finance views across branches</Feature>
          </ul>
        </div>
      </SectionCard>
      <BillingCard />
    </div>
  );
}

/** Billing #31, #32: what the Owner owes Primolar, when, and every payment so far. */
function BillingCard() {
  const sub = useSubscription();
  if (sub.isLoading) return <Loading label="Loading your billing" />;
  if (!sub.data) return <ErrorState what="your billing" onRetry={() => void sub.refetch()} />;
  const s = sub.data;
  return (
    <SectionCard title="Billing" description="Pay by QR and send Primolar your receipt. Every invoice shows the VAT included.">
      <BillingNotice subscription={s} />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Status</dt>
        <dd>{SUBSCRIPTION_STATE_LABEL[s.state]}</dd>
        <dt className="text-ink-muted">{s.cancelledAt ? "Ends on" : "Next due"}</dt>
        <dd>{formatBillingDate(s.nextDue)}</dd>
        {!s.cancelledAt && (
          <>
            <dt className="text-ink-muted">Amount</dt>
            <dd className="tabular-nums">
              {formatPeso(s.nextAmount)} <span className="text-ink-muted">(includes {formatPeso(s.nextVat)} VAT)</span>
            </dd>
          </>
        )}
        {s.downgrade && (
          <>
            <dt className="text-ink-muted">Plan change</dt>
            <dd>Moves to {TIER_LABEL[s.downgrade.tier]} on {formatBillingDate(s.downgrade.on)}. Nothing you have now is turned off.</dd>
          </>
        )}
      </dl>
      {s.cancelledAt && (
        <p className="text-sm text-ink-muted">
          Primolar has cancelled your subscription. Your clinic pauses on {formatBillingDate(s.nextDue)}, and every record is kept.
        </p>
      )}
      {!s.cancelledAt && <PayNow subscription={s} />}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Payment history</h3>
        <PaymentHistory subscription={s} />
      </div>
      {s.receipts.length > 0 && (
        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Receipts you sent</h3>
          <ReceiptList receipts={s.receipts} imageUrl={clinicReceiptImageUrl} />
        </div>
      )}
    </SectionCard>
  );
}

/** B12 decisions 5, 6, 21: the QR and the receipt form for the next unpaid month. One receipt waits at a time. */
function PayNow({ subscription: s }: { subscription: SubscriptionView }) {
  const upload = useUploadReceipt();
  const latest = s.receipts[0];
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <h3 className="text-sm font-semibold">Pay for the month from {formatBillingDate(s.nextDue)}</h3>
      {latest?.status !== "pending" && <PayByQr qr={s.paymentQr} amount={s.nextAmount} vat={s.nextVat} />}
      {(s.paymentQr || latest) && (
        <ReceiptUpload
          latest={latest}
          pending={upload.isPending}
          error={upload.error?.message}
          onSubmit={(input, file) => upload.mutate({ input, file })}
        />
      )}
    </div>
  );
}

/** "2 of 3", a meter, and over the limit after a downgrade, what that means (decision #9). Never colour alone. */
function Allowance({ label, allowance: { inUse, limit }, show = String }: { label: string; allowance: ClinicUsage["branches"]; show?: (n: number) => string }) {
  const over = limit !== null && inUse > limit;
  return (
    <div className="space-y-2 rounded-lg border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm tabular-nums">{limit === null ? `${show(inUse)} (unlimited)` : `${show(inUse)} of ${show(limit)}`}</p>
      </div>
      {limit !== null && (
        <meter aria-label={`${label} in use`} min={0} max={limit} value={Math.min(inUse, limit)} className="h-2 w-full accent-brand" />
      )}
      {over && <p className="text-sm text-ink-muted">Everything keeps working. You can&apos;t add more until you&apos;re under the limit.</p>}
    </div>
  );
}

function Feature({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <li className={on ? "text-ink" : "text-ink-muted"}>
      {children}
      <span className="text-ink-muted">{on ? " · included" : " · not on this plan"}</span>
    </li>
  );
}
