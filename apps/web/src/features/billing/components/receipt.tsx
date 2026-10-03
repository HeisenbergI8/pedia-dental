"use client";
import { format, parseISO } from "date-fns";
import { PrinterIcon } from "lucide-react";
import { formatPeso, invoiceBalance, invoiceTotal } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/features/clinic/api";
import { usePatient } from "@/features/patients/api";
import { METHOD_LABEL, useInvoices, usePayments } from "../api";

/** An acknowledgment receipt for one payment or refund. BIR official receipts are deferred. */
export function Receipt({ patientId, paymentId }: { patientId: string; paymentId: string }) {
  const patient = usePatient(patientId);
  const invoices = useInvoices(patientId);
  const payments = usePayments(patientId);
  const staff = useStaff().data ?? [];

  if (patient.isLoading || invoices.isLoading || payments.isLoading) return <p className="text-ink-muted">Loading receipt…</p>;
  const all = payments.data ?? [];
  const payment = all.find((p) => p.id === paymentId);
  const invoice = invoices.data?.find((i) => i.id === payment?.invoiceId);
  if (!patient.data || !payment || !invoice) return <p className="text-danger">This receipt doesn&apos;t exist for this patient.</p>;

  const refund = payment.amount < 0;
  const after = invoiceBalance(invoice, all.filter((p) => p.receivedAt <= payment.receivedAt)); // as it stood then
  const guardian = patient.data.guardians.find((g) => g.isPrimary);
  const rows: [string, string][] = [
    ["Patient", `${patient.data.firstName} ${patient.data.lastName}`],
    ...(guardian ? [[refund ? "Refunded to" : "Received from", guardian.fullName] as [string, string]] : []),
    ["Amount", formatPeso(Math.abs(payment.amount))],
    ["Method", `${METHOD_LABEL[payment.method]}${payment.referenceNo ? ` · ref ${payment.referenceNo}` : ""}`],
    ...(payment.note ? [["Reason", payment.note] as [string, string]] : []),
    ["For", invoice.lines.map((l) => `${l.description}${l.tooth ? ` (${l.tooth})` : ""}`).join(", ")],
    ["Invoice total", formatPeso(invoiceTotal(invoice))],
    ["Balance after this", formatPeso(after)],
    [refund ? "Refunded by" : "Received by", staff.find((s) => s.id === payment.receivedBy)?.fullName ?? payment.receivedBy],
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <PrinterIcon aria-hidden /> Print receipt
        </Button>
      </div>
      <article className="mx-auto max-w-xl space-y-5 rounded-xl border border-line bg-surface p-6 shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-1 text-center">
          <p className="text-lg font-semibold">Pedia Dental</p>
          <h1 className="text-base font-semibold tracking-wide uppercase">{refund ? "Refund acknowledgment" : "Acknowledgment receipt"}</h1>
          <p className="text-sm text-ink-muted">
            No. {payment.receiptNo} · {format(parseISO(payment.receivedAt), "MMM d, yyyy h:mm a")}
          </p>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line pt-3 text-xs text-ink-muted">This is an acknowledgment receipt, not an official receipt.</p>
      </article>
    </div>
  );
}
