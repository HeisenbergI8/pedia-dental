import { manilaMonth, primolarInvoiceNo, type ConfirmReceiptInput, type PaymentReceipt, type TextTopUp } from "@pedia/shared";
import { today } from "./clock";
import { platform } from "./db";

/*
 * Feature 16 (revised): paid text top-ups, Primolar's records like subscriptions. Reads and writes `platform` only (the
 * source guard in mocks/operator.test.ts reads it). The receipts that pay for them live in receipts.ts. API twin:
 * apps/api/src/text-topups/.
 */

/** One PRM-INV series for monthly invoices and top-up acknowledgments (D10): no gaps, no two documents one number. */
export const nextInvoiceNo = () =>
  primolarInvoiceNo(platform.subscriptions.reduce((n, s) => n + s.payments.length, 0) + platform.textTopUps.length + 1);

/** Billed parts the clinic bought for `month` (D1: no rollover). */
export const topUpPartsIn = (clinicId: string, month: string) =>
  platform.textTopUps.filter((t) => t.clinicId === clinicId && t.month === month).reduce((n, t) => n + t.parts, 0);

/** Newest first, for the payment history (D10). */
export const topUpsOf = (clinicId: string): TextTopUp[] =>
  platform.textTopUps.filter((t) => t.clinicId === clinicId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

/** The operator's confirm: the receipt's parts go to the Manila month it is confirmed in (D7), at its quoted price (D3). */
export function recordTopUp(receipt: PaymentReceipt & { payer: { kind: "text_topup"; clinicId: string } }, input: ConfirmReceiptInput): void {
  platform.textTopUps.push({
    id: `topup_${crypto.randomUUID()}`, clinicId: receipt.payer.clinicId, invoiceNo: nextInvoiceNo(), month: manilaMonth(today()),
    packs: receipt.packs!, parts: receipt.parts!, receiptId: receipt.id, amount: receipt.amountDue,
    method: input.method, paidOn: input.paidOn, reference: receipt.reference, recordedAt: new Date().toISOString(),
  });
}
