"use client";
import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { TIER_LABEL, formatBillingDate, formatPeso, textTopUpLine, type SubscriptionPayment, type SubscriptionView, type TextTopUp } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { downloadPrimolarInvoice, downloadPrimolarTopUpReceipt } from "../primolar-invoice";

type Row = { kind: "month"; p: SubscriptionPayment } | { kind: "topup"; p: TextTopUp };

/**
 * Billing #31, #33, feature 16 (D10): every payment to Primolar, months and text top-ups together, newest first, each
 * with its PDF. The table scrolls on a phone, not the page.
 */
export function PaymentHistory({ subscription }: { subscription: SubscriptionView }) {
  const [busy, setBusy] = useState<string>();
  const rows: Row[] = [
    ...subscription.payments.map((p) => ({ kind: "month" as const, p })),
    ...subscription.topUps.map((p) => ({ kind: "topup" as const, p })),
  ].sort((a, b) => b.p.paidOn.localeCompare(a.p.paidOn) || b.p.recordedAt.localeCompare(a.p.recordedAt));
  if (rows.length === 0) return <p className="text-sm text-ink-muted">No payments recorded yet.</p>;

  const download = (r: Row) => {
    setBusy(r.p.id);
    (r.kind === "month" ? downloadPrimolarInvoice(subscription.billedTo, r.p) : downloadPrimolarTopUpReceipt(subscription.billedTo, r.p))
      .catch(() => toast.error("The PDF couldn't be made. Try again."))
      .finally(() => setBusy(undefined));
  };

  return (
    // `relative` keeps the sr-only header label inside the scroll box; otherwise it widens the page on a phone.
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Payments to Primolar</caption>
        <thead>
          <tr className="border-b border-line text-left text-ink-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">Invoice</th>
            <th scope="col" className="py-2 pr-3 font-semibold">Paid on</th>
            <th scope="col" className="py-2 pr-3 font-semibold">For</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Amount</th>
            <th scope="col" className="py-2"><span className="sr-only">PDF</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.p.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 tabular-nums">{r.p.invoiceNo}</td>
              <td className="py-2 pr-3">{formatBillingDate(r.p.paidOn)}</td>
              <td className="py-2 pr-3">{r.kind === "month" ? `${TIER_LABEL[r.p.tier]} plan, from ${formatBillingDate(r.p.periodStart)}` : textTopUpLine(r.p)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(r.p.amount)}</td>
              <td className="py-2 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === r.p.id}
                  onClick={() => download(r)}
                  aria-label={`Download ${r.kind === "month" ? "invoice" : "acknowledgment"} ${r.p.invoiceNo}`}
                >
                  <DownloadIcon aria-hidden /> {r.kind === "month" ? "Invoice" : "Acknowledgment"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
