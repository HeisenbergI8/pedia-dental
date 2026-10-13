"use client";
import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { TIER_LABEL, formatBillingDate, formatPeso, type SubscriptionPayment, type SubscriptionView } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { downloadPrimolarInvoice } from "../primolar-invoice";

/** Billing #31, #33: every payment to Primolar, newest first, each with its invoice. The table scrolls on a phone, not the page. */
export function PaymentHistory({ subscription }: { subscription: SubscriptionView }) {
  const [busy, setBusy] = useState<string>();
  if (subscription.payments.length === 0) return <p className="text-sm text-ink-muted">No payments recorded yet.</p>;

  const download = (p: SubscriptionPayment) => {
    setBusy(p.id);
    downloadPrimolarInvoice(subscription.billedTo, p)
      .catch(() => toast.error("The invoice couldn't be made. Try again."))
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
            <th scope="col" className="py-2"><span className="sr-only">Invoice PDF</span></th>
          </tr>
        </thead>
        <tbody>
          {subscription.payments.map((p) => (
            <tr key={p.id} className="border-b border-line last:border-0">
              <td className="py-2 pr-3 tabular-nums">{p.invoiceNo}</td>
              <td className="py-2 pr-3">{formatBillingDate(p.paidOn)}</td>
              <td className="py-2 pr-3">{TIER_LABEL[p.tier]} plan, from {formatBillingDate(p.periodStart)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatPeso(p.amount)}</td>
              <td className="py-2 text-right">
                <Button variant="outline" size="sm" disabled={busy === p.id} onClick={() => download(p)} aria-label={`Download invoice ${p.invoiceNo}`}>
                  <DownloadIcon aria-hidden /> Invoice
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
