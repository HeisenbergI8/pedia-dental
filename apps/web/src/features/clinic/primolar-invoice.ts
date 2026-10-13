import { DEFAULT_BRAND_COLOR, TIER_LABEL, formatBillingDate, formatPeso, vatPart, type SubscriptionPayment, type SubscriptionView } from "@pedia/shared";
import { METHOD_LABEL } from "@/features/billing/api";
import type { DocContent } from "@/features/documents/content";
import { downloadPdf } from "@/features/documents/download";

type BilledTo = SubscriptionView["billedTo"];

/**
 * S10, billing #22, #33: a simple Primolar invoice for one payment, drawn by the documents' PDF builder. Primolar's
 * letterhead: its name as text and its plum ring, never the clinic's logo or colour, and never Primolar's logo image
 * (which stays off clinic screens, platform #32). Prices include VAT, so the VAT is shown as the part inside the total.
 */
export function primolarInvoice(billedTo: BilledTo, p: SubscriptionPayment): DocContent {
  const vat = vatPart(p.amount);
  const paidBy = p.reference ? `${METHOD_LABEL[p.method]} · ${p.reference}` : METHOD_LABEL[p.method];
  return {
    title: "Invoice",
    subtitle: `${p.invoiceNo} · ${formatBillingDate(p.paidOn)}`,
    clinicName: "Primolar",
    fileName: `${p.invoiceNo}.pdf`,
    letterhead: { clinicName: "Primolar", branchLine: "Pediatric dental clinic software", logoUrl: null, ring: DEFAULT_BRAND_COLOR },
    blocks: [
      { kind: "rows", heading: "Billed to", rows: [["Clinic", billedTo.name], ["TIN", billedTo.tin], ["Email", billedTo.contactEmail]] },
      {
        kind: "rows",
        heading: "Subscription",
        rows: [
          ["Plan", TIER_LABEL[p.tier]],
          ["Period", `${formatBillingDate(p.periodStart)} to ${formatBillingDate(p.periodEnd)}`],
          ["Paid by", paidBy],
          ["Paid on", formatBillingDate(p.paidOn)],
        ],
      },
      {
        kind: "table",
        head: ["Item", "Amount"],
        rows: p.lines.map((l) => [l.label, formatPeso(l.amount)]),
        foot: ["Total (VAT included)", formatPeso(p.amount)],
        numeric: [1],
      },
      { kind: "rows", rows: [["VAT (12%) included", formatPeso(vat)], ["Amount before VAT", formatPeso(p.amount - vat)]] },
    ],
    footnote: "Not an official receipt. Primolar issues BIR official receipts from launch.",
  };
}

/** Builds and saves the PDF in the browser; react-pdf loads on the first download (documents/download.ts). */
export const downloadPrimolarInvoice = (billedTo: BilledTo, p: SubscriptionPayment) => downloadPdf(primolarInvoice(billedTo, p));
