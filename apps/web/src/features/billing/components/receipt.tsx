"use client";
import { PrinterIcon } from "lucide-react";
import { isMoneyIn } from "@pedia/shared";
import { KidsmileLogo, Loading } from "@/components/brand";
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

  if (patient.isLoading || invoices.isLoading || payments.isLoading) return <Loading label="Loading receipt" />;
  const all = payments.data ?? [];
  const payment = all.find((p) => p.id === paymentId);
  const invoice = invoices.data?.find((i) => i.id === payment?.invoiceId);
  // A deposit has no invoice; a payment that names one must find it. Transfers from a deposit get no receipt.
  if (!patient.data || !payment || !isMoneyIn(payment) || (payment.invoiceId && !invoice)) return <p className="text-danger">This receipt doesn&apos;t exist for this patient.</p>;

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
        <header className="flex flex-col items-center gap-1 border-b-2 border-brand-ring pb-4 text-center">
          <KidsmileLogo className="mb-2 w-44" />
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
