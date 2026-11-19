import { ReceiptToCheck, ReceiptView, type ReceiptPayer } from "@pedia/shared";
import type { PaymentReceipt as ReceiptRow, Prisma } from "../generated/prisma/client.ts";

export const RECEIPT_COLUMNS = {
  id: true, purpose: true, signupId: true, clinicId: true, periodStart: true, packs: true, parts: true, amountDue: true, reference: true, uploadedAt: true,
  status: true, rejectionReason: true,
} as const satisfies Prisma.PaymentReceiptSelect;
export type ReceiptColumns = Pick<ReceiptRow, keyof typeof RECEIPT_COLUMNS>;

/** What the sender sees (the Owner on Settings → Plan, a sign-up on its status page). */
export const toReceiptView = (r: ReceiptColumns): ReceiptView =>
  ReceiptView.parse({
    id: r.id, reference: r.reference, amountDue: r.amountDue, uploadedAt: r.uploadedAt.toISOString(), status: r.status,
    rejectionReason: r.rejectionReason, periodStart: r.periodStart ? r.periodStart.toISOString().slice(0, 10) : null,
    packs: r.packs, parts: r.parts,
  });

export const payerOf = (r: Pick<ReceiptRow, "purpose" | "signupId" | "clinicId">): ReceiptPayer =>
  r.purpose === "signup" ? { kind: "signup", signupId: r.signupId! } : { kind: r.purpose, clinicId: r.clinicId! };

/** The where clause for one payer's receipts. */
export const payerWhere = (p: ReceiptPayer): Prisma.PaymentReceiptWhereInput =>
  p.kind === "signup" ? { purpose: "signup", signupId: p.signupId } : { purpose: p.kind, clinicId: p.clinicId };

/** Payments to check: the receipt and whom it is from, by name. */
export const toReceiptToCheck = (r: ReceiptColumns, names: { clinics: Map<string, string>; signups: Map<string, { reference: string; name: string }> }): ReceiptToCheck =>
  ReceiptToCheck.parse({
    ...toReceiptView(r),
    payer:
      r.purpose === "signup"
        ? { kind: "signup", signupId: r.signupId, signupReference: names.signups.get(r.signupId!)?.reference ?? "", clinicName: names.signups.get(r.signupId!)?.name ?? "" }
        : { kind: r.purpose, clinicId: r.clinicId, clinicName: names.clinics.get(r.clinicId!) ?? "" },
  });
