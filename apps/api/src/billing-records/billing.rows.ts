import { Invoice, Payment } from "@pedia/shared";
import type { Invoice as InvoiceRow, InvoiceLine as LineRow, Payment as PaymentRow, Prisma } from "../generated/prisma/client.ts";

/** Read only the columns a response needs (CONVENTIONS → Data). */
export const INVOICE_COLUMNS = {
  id: true, clinicId: true, branchId: true, patientId: true, visitId: true, appointmentId: true, discount: true, issuedAt: true,
  voidedAt: true, voidedBy: true, voidReason: true,
} as const satisfies Prisma.InvoiceSelect;
export const LINE_COLUMNS = {
  invoiceId: true, position: true, planItemId: true, procedureCode: true, description: true, tooth: true, amount: true,
} as const satisfies Prisma.InvoiceLineSelect;
export const PAYMENT_COLUMNS = {
  id: true, clinicId: true, branchId: true, patientId: true, invoiceId: true, appliedTo: true, amount: true, method: true,
  referenceNo: true, note: true, receiptNo: true, receivedBy: true, receivedAt: true,
} as const satisfies Prisma.PaymentSelect;
/** A patient's payments in the mock's order: received, then the credit's bill side before its deposit side. */
export const PAYMENT_ORDER = [{ receivedAt: "asc" }, { receiptLeg: "asc" }, { id: "asc" }] as const satisfies Prisma.PaymentOrderByWithRelationInput[];

const opt = <T>(v: T | null) => v ?? undefined;

/** Row + its lines (any order) → the contract. Parsed, so a bad row fails here, not in the web. */
export function toInvoice(r: Pick<InvoiceRow, keyof typeof INVOICE_COLUMNS>, lines: Pick<LineRow, keyof typeof LINE_COLUMNS>[]): Invoice {
  return Invoice.parse({
    id: r.id, clinicId: r.clinicId, branchId: r.branchId, patientId: r.patientId,
    visitId: opt(r.visitId), appointmentId: opt(r.appointmentId), discount: r.discount, issuedAt: r.issuedAt.toISOString(),
    lines: [...lines].sort((a, b) => a.position - b.position).map((l) => ({
      planItemId: opt(l.planItemId), procedureCode: l.procedureCode, description: l.description, tooth: opt(l.tooth), amount: l.amount,
    })),
    ...(r.voidedAt && { voided: { at: r.voidedAt.toISOString(), by: r.voidedBy!, reason: r.voidReason! } }),
  });
}

export function toPayment(r: Pick<PaymentRow, keyof typeof PAYMENT_COLUMNS>): Payment {
  return Payment.parse({
    id: r.id, clinicId: r.clinicId, branchId: r.branchId, patientId: r.patientId, invoiceId: opt(r.invoiceId), appliedTo: opt(r.appliedTo),
    amount: r.amount, method: r.method, referenceNo: opt(r.referenceNo), note: opt(r.note), receiptNo: r.receiptNo,
    receivedBy: r.receivedBy, receivedAt: r.receivedAt.toISOString(),
  });
}

/** Contract → rows (the seed, and a new bill). A live bill's lines carry livePlanItemId (E6). */
export function invoiceRows(i: Invoice) {
  const invoice = {
    id: i.id, branchId: i.branchId, patientId: i.patientId, visitId: i.visitId ?? null, appointmentId: i.appointmentId ?? null,
    discount: i.discount, issuedAt: new Date(i.issuedAt), voidedAt: i.voided ? new Date(i.voided.at) : null, voidedBy: i.voided?.by ?? null,
    voidReason: i.voided?.reason ?? null,
  };
  const lines = i.lines.map((l, position) => ({
    invoiceId: i.id, position, planItemId: l.planItemId ?? null, livePlanItemId: i.voided ? null : (l.planItemId ?? null),
    procedureCode: l.procedureCode, description: l.description, tooth: l.tooth ?? null, amount: l.amount,
  }));
  return { invoice, lines };
}

/** Payments → rows, legs numbered within each receipt in the given order (the seed's array order). */
export function paymentRows(payments: Payment[]) {
  const seen = new Map<string, number>();
  return payments.map((p) => {
    const leg = seen.get(p.receiptNo) ?? 0;
    seen.set(p.receiptNo, leg + 1);
    return {
      id: p.id, branchId: p.branchId, patientId: p.patientId, invoiceId: p.invoiceId ?? null, appliedTo: p.appliedTo ?? null, amount: p.amount,
      method: p.method, referenceNo: p.referenceNo ?? null, note: p.note ?? null, receiptNo: p.receiptNo, receiptLeg: leg, receivedBy: p.receivedBy,
      receivedAt: new Date(p.receivedAt),
    };
  });
}

/** Each series' last number in `payments`, for ReceiptCounter (the seed). */
export function receiptCounters(payments: Pick<Payment, "receiptNo">[]): { series: string; last: number }[] {
  const last = new Map<string, number>();
  for (const { receiptNo } of payments) {
    const [series, n] = receiptNo.split("-");
    last.set(series!, Math.max(last.get(series!) ?? 0, Number(n)));
  }
  return [...last].map(([series, n]) => ({ series, last: n }));
}
