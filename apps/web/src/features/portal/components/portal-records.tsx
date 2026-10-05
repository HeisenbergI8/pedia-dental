"use client";
import { format, parseISO } from "date-fns";
import { accountSummary, depositBalance, formatPeso, invoiceBalance, invoiceTotal, planProgress, toothName, type Payment, type PlanItemStatus } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { useInvoices, usePayments, METHOD_LABEL } from "@/features/billing/api";
import { useProcedures } from "@/features/clinic/api";
import { CARE_KINDS, KIND_LABEL, usePatientMessages } from "@/features/messages/api";
import { usePlan } from "@/features/plan/api";
import { ClipboardListIcon, HeartPulseIcon, ReceiptIcon } from "lucide-react";
import { useActiveChild } from "../use-child";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { MetaLine } from "@/components/meta-line";

/** Plain words for parents. The staff labels say "Declined", which reads like a refusal of care. */
const PLAN_STATUS: Record<PlanItemStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  declined: "Not going ahead",
};
const day = (iso: string) => format(parseISO(iso), "MMMM d, yyyy");

export function PortalPlan() {
  const child = useActiveChild();
  const { data: items = [], isLoading, error, refetch, isRefetching } = usePlan(child.id);
  const procedures = useProcedures().data ?? [];
  const { done, total } = planProgress(items);
  const name = (code: string) => procedures.find((p) => p.code === code)?.name ?? code;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{child.firstName}&apos;s treatment plan</h1>
      {isLoading ? <Loading label="Loading the plan" /> : error ? <ErrorState what="the plan" onRetry={() => refetch()} retrying={isRefetching} /> : items.length === 0 ? (
        <EmptyState tone="warm" icon={ClipboardListIcon} title="Nothing planned right now">
          After a check-up, the dentist&apos;s plan for {child.firstName} will show here.
        </EmptyState>
      ) : (
        <SectionCard title={`${done} of ${total} treatments done`}>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Treatments done" className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full bg-brand" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <ul className="mt-4 divide-y divide-line">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className="flex-1">
                  <span className={i.status === "declined" ? "text-ink-muted" : "font-medium"}>{name(i.procedureCode)}</span>
                  {i.tooth && <span className="block text-sm text-ink-muted">Tooth {i.tooth}, {toothName(i.tooth)}</span>}
                </span>
                <span className="tabular-nums">{formatPeso(i.fee)}</span>
                <Badge variant={i.status === "done" ? "default" : "outline"}>{PLAN_STATUS[i.status]}</Badge>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

export function PortalBilling() {
  const child = useActiveChild();
  const invoices = useInvoices(child.id);
  const payments = usePayments(child.id);
  const allInvoices = invoices.data ?? [];
  const allPayments = payments.data ?? [];
  const summary = accountSummary(allInvoices, allPayments);
  const held = depositBalance(allPayments, child.id);
  const depositRows = allPayments.filter((p) => !p.invoiceId);
  const billOf = (id?: string) => allInvoices.find((i) => i.id === id);
  /** In a parent's words: what happened to this money, and when. */
  const said = (p: Payment) => {
    if (p.method === "account_credit") {
      if (p.invoiceId) return `${p.amount > 0 ? "Paid from your deposit" : "Returned to your deposit"} ${day(p.receivedAt)}`;
      const bill = billOf(p.appliedTo);
      return p.amount < 0 ? `Used for the bill of ${bill ? day(bill.issuedAt) : "a visit"}` : `Returned from the bill of ${bill ? day(bill.issuedAt) : "a visit"}`;
    }
    if (!p.invoiceId) return `${p.amount < 0 ? "Deposit refunded to you" : "Deposit paid"} ${day(p.receivedAt)}`;
    return `${p.amount < 0 ? "Refunded to you" : "Paid"} ${day(p.receivedAt)}`;
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Bills for {child.firstName}</h1>
      {invoices.isLoading || payments.isLoading ? <Loading label="Loading bills" /> : invoices.error || payments.error ? <ErrorState what="the bills" onRetry={() => [invoices, payments].forEach((q) => q.refetch())} /> : allInvoices.length === 0 && depositRows.length === 0 ? (
        <EmptyState tone="warm" icon={ReceiptIcon} title="No bills yet">Bills from {child.firstName}&apos;s visits will show here.</EmptyState>
      ) : (
        <>
          <SectionCard title={summary.balance > 0 ? `Balance ${formatPeso(summary.balance)}` : "Nothing to pay"} description="Pay at the clinic by cash, GCash, Maya, card or bank transfer.">
            <dl className="grid grid-cols-2 gap-4 tabular-nums">
              <div><dt className="text-sm text-ink-muted">Total billed</dt><dd className="font-semibold">{formatPeso(summary.total)}</dd></div>
              <div><dt className="text-sm text-ink-muted">Paid</dt><dd className="font-semibold">{formatPeso(summary.paid)}</dd></div>
            </dl>
          </SectionCard>
          {depositRows.length > 0 && (
            <SectionCard title={`Deposit on account ${formatPeso(held)}`} description="Money paid ahead, used for bills as they come.">
              <ul className="divide-y divide-line-soft text-sm">
                {depositRows.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <MetaLine items={[said(p), p.method !== "account_credit" && METHOD_LABEL[p.method], p.receiptNo]} />
                    <span className="whitespace-nowrap tabular-nums">{formatPeso(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          {[...allInvoices].reverse().map((inv) => {
            const balance = invoiceBalance(inv, allPayments);
            return (
              <SectionCard key={inv.id} as="article" headingLevel={2} title={`Bill of ${day(inv.issuedAt)}`} description={balance === 0 ? "Paid in full" : `Balance ${formatPeso(balance)}`}>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-line">
                    {inv.lines.map((l, n) => (
                      <tr key={n}><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right tabular-nums">{formatPeso(l.amount)}</td></tr>
                    ))}
                    {inv.discount > 0 && <tr><td className="py-1.5">Discount</td><td className="py-1.5 text-right tabular-nums">−{formatPeso(inv.discount)}</td></tr>}
                    <tr className="font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right tabular-nums">{formatPeso(invoiceTotal(inv))}</td></tr>
                    {allPayments.filter((p) => p.invoiceId === inv.id).map((p) => (
                      <tr key={p.id} className="text-ink-muted">
                        <td className="py-1.5">
                          <MetaLine items={[said(p), p.method !== "account_credit" && METHOD_LABEL[p.method], p.receiptNo]} />
                        </td>
                        {/* Against the bill: a payment lowers it, a refund raises it again. Sign stays with the amount. */}
                        <td className="py-1.5 text-right whitespace-nowrap tabular-nums">
                          {p.amount < 0 ? `+${formatPeso(-p.amount)}` : formatPeso(-p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </SectionCard>
            );
          })}
        </>
      )}
    </div>
  );
}

export function PortalCare() {
  const child = useActiveChild();
  const { data = [], isLoading, error, refetch, isRefetching } = usePatientMessages(child.id);
  const care = data.filter((m) => CARE_KINDS.includes(m.kind) && m.status !== "cancelled");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Care instructions for {child.firstName}</h1>
      {isLoading ? <Loading label="Loading instructions" /> : error ? <ErrorState what="the care instructions" onRetry={() => refetch()} retrying={isRefetching} /> : care.length === 0 ? (
        <EmptyState tone="warm" icon={HeartPulseIcon} title="No instructions yet">
          After a treatment, the clinic&apos;s instructions for {child.firstName} will show here.
        </EmptyState>
      ) : (
        care.map((m) => (
          <SectionCard key={m.id} as="article" headingLevel={2} title={KIND_LABEL[m.kind]} description={day(m.sendAt)}>
            <p className="whitespace-pre-line">{m.body}</p>
          </SectionCard>
        ))
      )}
      <p className="text-sm text-ink-muted">If you&apos;re worried about {child.firstName} after a treatment, call the clinic.</p>
    </div>
  );
}
