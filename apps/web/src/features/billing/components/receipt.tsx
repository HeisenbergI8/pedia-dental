"use client";
import { PrinterIcon } from "lucide-react";
import { CLINIC_NAME } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { useStaff } from "@/features/clinic/api";
import { DownloadDocumentButton } from "@/features/documents/components/download-document-button";
import { usePatient } from "@/features/patients/api";
import { useInvoices, usePayments } from "../api";
import { receiptContent } from "../receipt-rows";

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

  const receipt = receiptContent({ patient: patient.data, invoice, payment, payments: all, staff });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        <DownloadDocumentButton variant="outline" patientId={patientId} choice={{ type: "receipt", sourceId: payment.id, issuedBy: payment.receivedBy }} />
        <Button onClick={() => window.print()}>
          <PrinterIcon aria-hidden /> Print receipt
        </Button>
      </div>
      <article className="mx-auto max-w-xl space-y-5 rounded-xl border border-line bg-surface p-6 shadow-card print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-1 text-center">
          <p className="text-lg font-semibold">{CLINIC_NAME}</p>
          <h1 className="text-base font-semibold tracking-wide uppercase">{receipt.title}</h1>
          <p className="text-sm text-ink-muted">{receipt.subtitle}</p>
        </header>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {receipt.rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line pt-3 text-xs text-ink-muted">{receipt.footnote}</p>
      </article>
    </div>
  );
}
