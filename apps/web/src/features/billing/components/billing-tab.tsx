"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ReceiptIcon } from "lucide-react";
import { accountSummary, appliedCredit, depositBalance, formatPeso, invoiceBalance, invoiceTotal, isMoneyIn, type Invoice, type Payment } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { MetaLine } from "@/components/meta-line";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { useCan } from "@/features/auth/access";
import { usePlan } from "@/features/plan/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { paymentLabel, useInvoices, usePayments } from "../api";
import { ApplyCreditDialog } from "./apply-credit-dialog";
import { CreateInvoice } from "./create-invoice";
import { PaymentDialog, type PaymentTarget } from "./payment-dialog";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

export function BillingTab({ patientId }: { patientId: string }) {
  const invoices = useInvoices(patientId);
  const payments = usePayments(patientId);
  const plan = usePlan(patientId);
  const [paying, setPaying] = useState<PaymentTarget | null>(null);
  const [crediting, setCrediting] = useState<{ invoice: Invoice; mode: "apply" | "return" } | null>(null);
  const canCollect = useCan()("billing.collect");

  if (invoices.isLoading || payments.isLoading || plan.isLoading) return <Loading label="Loading billing" />;
  if (invoices.error || payments.error || plan.error) return <ErrorState what="this patient's billing" onRetry={() => [invoices, payments, plan].forEach((q) => q.refetch())} />;
  const allInvoices = invoices.data ?? [];
  const allPayments = payments.data ?? [];
  const summary = accountSummary(allInvoices, allPayments);
  const held = depositBalance(allPayments, patientId);
  const depositRows = allPayments.filter((p) => !p.invoiceId);
  const totals: [string, number][] = [["Total billed", summary.total], ["Paid", summary.paid], ["Balance", summary.balance]];
  // Only once the family has used deposits: otherwise two zero rows on every statement.
  if (depositRows.length) totals.push(["Deposit on account", held], ["Due after deposit", Math.max(0, summary.balance - held)]);

  return (
    <div className="space-y-5">
      <SectionCard
        title="Statement"
        description="Balances are worked out from the payments received."
        action={
          canCollect && (
            <>
              {held > 0 && (
                <Button variant="ghost" size="sm" className="text-ink-muted" onClick={() => setPaying({ deposit: true, patientId, held, refund: true })}>Refund deposit</Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setPaying({ deposit: true, patientId, held, refund: false })}>Take deposit</Button>
            </>
          )
        }
      >
        <dl className={depositRows.length ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" : "grid grid-cols-3 gap-4"}>
          {totals.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-ink-muted">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatPeso(value)}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      {canCollect && <CreateInvoice patientId={patientId} items={plan.data ?? []} invoices={allInvoices} />}

      {allInvoices.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title="No invoices yet">
          A treatment can be billed once the note that completes it is signed.
        </EmptyState>
      ) : (
        [...allInvoices].reverse().map((inv) => {
          const own = allPayments.filter((p) => p.invoiceId === inv.id);
          const balance = invoiceBalance(inv, allPayments);
          const paid = invoiceTotal(inv) - balance;
          return (
            <SectionCard
              key={inv.id}
              as="article"
              headingLevel={3}
              title={`Invoice of ${formatDate(inv.issuedAt)}`}
              description={balance === 0 ? "Paid in full" : `Balance ${formatPeso(balance)}`}
              action={
                canCollect && (
                  <>
                    {appliedCredit(inv.id, allPayments) > 0 && (
                      <Button variant="ghost" size="sm" className="text-ink-muted" onClick={() => setCrediting({ invoice: inv, mode: "return" })}>Return to deposit</Button>
                    )}
                    {paid - appliedCredit(inv.id, allPayments) > 0 && (
                      <Button variant="ghost" size="sm" className="text-ink-muted" onClick={() => setPaying({ invoice: inv, refund: true })}>Refund</Button>
                    )}
                    {balance > 0 && held > 0 && (
                      <Button variant="outline" size="sm" onClick={() => setCrediting({ invoice: inv, mode: "apply" })}>Pay from deposit</Button>
                    )}
                    {balance > 0 && <Button size="sm" onClick={() => setPaying({ invoice: inv, refund: false })}>Record payment</Button>}
                  </>
                )
              }
            >
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line">
                  {inv.lines.map((l, idx) => (
                    <tr key={l.planItemId ?? idx}>
                      <td className="py-1.5">{l.description}{l.tooth ? ` · tooth ${l.tooth}` : ""}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatPeso(l.amount)}</td>
                    </tr>
                  ))}
                  {inv.discount > 0 && (
                    <tr>
                      <td className="py-1.5">Discount</td>
                      <td className="py-1.5 text-right tabular-nums">−{formatPeso(inv.discount)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-right tabular-nums">{formatPeso(invoiceTotal(inv))}</td>
                  </tr>
                </tbody>
              </table>
              {own.length > 0 && <PaymentHistory rows={own} patientId={patientId} invoices={allInvoices} />}
            </SectionCard>
          );
        })
      )}

      {depositRows.length > 0 && (
        <SectionCard title="Deposit" headingLevel={3} description={`${formatPeso(held)} on account, applied to invoices as they're paid.`}>
          <PaymentHistory rows={depositRows} patientId={patientId} invoices={allInvoices} />
        </SectionCard>
      )}

      {paying && (
        <PaymentDialog key={`${"invoice" in paying ? paying.invoice.id : "deposit"}-${paying.refund}`} target={paying} payments={allPayments} onClose={() => setPaying(null)} />
      )}
      {crediting && (
        <ApplyCreditDialog key={`${crediting.invoice.id}-${crediting.mode}`} invoice={crediting.invoice} payments={allPayments} mode={crediting.mode} onClose={() => setCrediting(null)} />
      )}
    </div>
  );
}

/** Payments, refunds and deposit moves, oldest first. A transfer has no acknowledgment receipt, only its CR number. */
function PaymentHistory({ rows, patientId, invoices }: { rows: Payment[]; patientId: string; invoices: Invoice[] }) {
  const invoiceOf = (id?: string) => invoices.find((i) => i.id === id);
  return (
    <ul className="space-y-3 border-t border-line pt-3 text-sm">
      {rows.map((p) => {
        const to = invoiceOf(p.appliedTo);
        return (
          <li key={p.id}>
            {/* What and how much first; when, reference and receipt on the line below. */}
            <div className="flex items-baseline justify-between gap-3">
              <span>{to ? `${paymentLabel(p)} of ${formatDate(to.issuedAt)}` : paymentLabel(p)}</span>
              <span className={cn("tabular-nums whitespace-nowrap", p.amount < 0 && isMoneyIn(p) && "text-danger")}>{formatPeso(p.amount)}</span>
            </div>
            <MetaLine
              items={[
                <span key="at" className="tabular-nums">{format(parseISO(p.receivedAt), "MMM d, yyyy h:mm a")}</span>,
                p.referenceNo && `ref ${p.referenceNo}`,
                isMoneyIn(p) ? (
                  <Link key="receipt" href={`/patients/${patientId}/receipts/${p.id}`} className="text-brand underline">Receipt {p.receiptNo}</Link>
                ) : (
                  `Transfer ${p.receiptNo}`
                ),
              ]}
            />
          </li>
        );
      })}
    </ul>
  );
}
