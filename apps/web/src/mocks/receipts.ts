import { HttpResponse } from "msw";
import type { z } from "zod";
import {
  RECEIPT_PENDING,
  imageProblem,
  unpaidFrom,
  type ConfirmReceiptInput,
  type ImageRules,
  type PaymentReceipt,
  type ReceiptPayer,
  type ReceiptToCheck,
  type ReceiptView,
} from "@pedia/shared";
import { SEED_FILES, SEED_RECEIPT_REF } from "@pedia/seed";
import { getBlob, putBlob } from "./blob-store";
import { accountById, persist, platform } from "./db";
import { fileResponse } from "./signups";
import { recordSubscriptionPayment, subscriptionOf, subscriptionView } from "./subscriptions";

/*
 * B12: Primolar's payment QR and the receipts clinics send (decisions 5–8, 21–24). Platform-level, like the sign-ups:
 * this file reads and writes `platform` only (the source guard in mocks/operator.test.ts reads it). The clinic's own
 * routes pass their clinic id in.
 */

const refuse = (status: 400 | 404 | 409 | 413, message: string) => new HttpResponse(message, { status });

/**
 * A multipart body with a `data` JSON part parsed by `schema` and an image `file` (the QR or a receipt). `required`:
 * whether a file must come with it. A refusal comes back as the Response to return.
 */
export async function readImageForm<T extends z.ZodType>(request: Request, schema: T, rules: ImageRules, required: boolean): Promise<{ data: z.infer<T>; file?: File } | Response> {
  const form = await request.formData().catch(() => undefined);
  if (!form) return refuse(400, "Send the form as multipart/form-data");
  let json: unknown;
  try {
    json = JSON.parse(String(form.get("data")));
  } catch {
    return refuse(400, "The form's data part isn't valid JSON");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
  const part = form.get("file");
  const file = part instanceof File && part.size > 0 ? part : undefined;
  if (file || required) {
    const problem = imageProblem(rules, file);
    if (problem) return refuse(file && file.size > rules.maxBytes ? 413 : 400, problem);
  }
  return { data: parsed.data, file };
}

/** A stored image as a response; the seeded receipt's bytes come from @pedia/seed so "Reset demo data" never loses them. */
export async function imageResponse(fileRef: string | null): Promise<Response> {
  if (fileRef === SEED_RECEIPT_REF && !(await getBlob(fileRef))) {
    return new HttpResponse(new Blob([SEED_FILES["image/png"].slice()], { type: "image/png" }), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" } });
  }
  return fileRef ? fileResponse(fileRef) : refuse(404, "Receipt not found");
}

/** Stores an uploaded image under a fresh key and returns the key. */
export async function keepImage(prefix: string, file: Blob): Promise<string> {
  const key = `${prefix}_${crypto.randomUUID()}`;
  await putBlob(key, file);
  return key;
}

const samePayer = (a: ReceiptPayer, b: ReceiptPayer) =>
  a.kind === "signup" ? b.kind === "signup" && a.signupId === b.signupId : b.kind === "subscription" && a.clinicId === b.clinicId;
/** Newest first. */
const receiptsOf = (payer: ReceiptPayer) => platform.receipts.filter((r) => samePayer(r.payer, payer)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

export const receiptView = ({ id, reference, amountDue, uploadedAt, status, rejectionReason, periodStart }: PaymentReceipt): ReceiptView => ({
  id, reference, amountDue, uploadedAt, status, rejectionReason, periodStart,
});
export const latestReceipt = (payer: ReceiptPayer): ReceiptView | null => {
  const [latest] = receiptsOf(payer);
  return latest ? receiptView(latest) : null;
};
export const receiptsOfClinic = (clinicId: string): ReceiptView[] => receiptsOf({ kind: "subscription", clinicId }).map(receiptView);

/** A receipt with whom it is from (the operator's view). */
export function toCheck(r: PaymentReceipt): ReceiptToCheck {
  if (r.payer.kind === "subscription") return { ...receiptView(r), payer: { ...r.payer, clinicName: accountById(r.payer.clinicId)?.name ?? "" } };
  const { signupId } = r.payer;
  const signup = platform.signups.find((s) => s.id === signupId);
  return { ...receiptView(r), payer: { kind: "signup", signupId, signupReference: signup?.reference ?? "", clinicName: signup?.account.name ?? "" } };
}

/** Payments to check (decision 8): pending only, oldest first. */
export const receiptsToCheck = (): ReceiptToCheck[] =>
  platform.receipts.filter((r) => r.status === "pending").sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)).map(toCheck);

/** Decisions 6, 21: a clinic's receipt for its first unpaid month, at what that month costs now. One waits at a time. */
export async function addClinicReceipt(clinicId: string, reference: string, file: File): Promise<string | undefined> {
  const sub = subscriptionOf(clinicId)!;
  if (sub.cancelledAt) return "This subscription is cancelled, so Primolar takes no more payments for it.";
  const payer: ReceiptPayer = { kind: "subscription", clinicId };
  if (receiptsOf(payer).some((r) => r.status === "pending")) return RECEIPT_PENDING;
  const { nextAmount } = subscriptionView(clinicId);
  platform.receipts.push({
    id: `receipt_${crypto.randomUUID()}`, payer, reference, amountDue: nextAmount, periodStart: unpaidFrom(sub),
    uploadedAt: new Date().toISOString(), status: "pending", rejectionReason: null, fileRef: await keepImage(`receipt_${clinicId}`, file),
  });
  persist();
  return undefined;
}

/** Decision 7: a waiting sign-up's receipt for its whole quote. */
export async function addSignupReceipt(signupId: string, reference: string, file: File): Promise<string | undefined> {
  const signup = platform.signups.find((s) => s.id === signupId)!;
  if (signup.status !== "waiting") return "This sign-up has already been decided";
  if (signup.payment) return "Primolar has already confirmed your payment";
  const payer: ReceiptPayer = { kind: "signup", signupId };
  if (receiptsOf(payer).some((r) => r.status === "pending")) return RECEIPT_PENDING;
  platform.receipts.push({
    id: `receipt_${crypto.randomUUID()}`, payer, reference, amountDue: signup.quote.total, periodStart: null,
    uploadedAt: new Date().toISOString(), status: "pending", rejectionReason: null, fileRef: await keepImage(`receipt_${signupId}`, file),
  });
  persist();
  return undefined;
}

export const findReceipt = (id: unknown) => (typeof id === "string" ? platform.receipts.find((r) => r.id === id) : undefined);
const ALREADY_CHECKED = "This receipt has already been checked";

/**
 * Decisions 6, 7, 22: the full amount due, for the month it was sent for. A subscription receipt records that month's
 * payment (which lifts an overdue pause); a sign-up's records its setup fee, after which Approve works.
 */
export function confirmReceipt(receipt: PaymentReceipt, input: ConfirmReceiptInput): string | undefined {
  if (receipt.status !== "pending") return ALREADY_CHECKED;
  if (receipt.payer.kind === "subscription") {
    const { clinicId } = receipt.payer;
    const sub = subscriptionOf(clinicId)!;
    if (sub.cancelledAt) return "This subscription is cancelled, so Primolar records no more payments for it.";
    if (receipt.periodStart !== unpaidFrom(sub)) return "This month is already paid. Reject the receipt if it was sent twice.";
    if (receipt.amountDue !== subscriptionView(clinicId).nextAmount) return "The amount due has changed since this receipt was sent. Reject it and ask for a new one.";
    const refused = recordSubscriptionPayment(clinicId, { ...input, reference: receipt.reference });
    if (refused) return refused;
  } else {
    const { signupId } = receipt.payer;
    const signup = platform.signups.find((s) => s.id === signupId)!;
    if (signup.status !== "waiting") return "This sign-up has already been decided";
    if (signup.payment) return "The setup fee is already recorded";
    signup.payment = { ...input, reference: receipt.reference, amount: signup.quote.total, recordedAt: new Date().toISOString() };
  }
  Object.assign(receipt, { status: "confirmed", decidedAt: new Date().toISOString() });
  persist();
  return undefined;
}

/** Decision 6: the reason the payer reads; they can send a new one (21). */
export function rejectReceipt(receipt: PaymentReceipt, reason: string): string | undefined {
  if (receipt.status !== "pending") return ALREADY_CHECKED;
  Object.assign(receipt, { status: "rejected", rejectionReason: reason, decidedAt: new Date().toISOString() });
  persist();
  return undefined;
}

/** Rejecting a sign-up rejects its waiting receipt too. */
export function rejectSignupReceipts(signupId: string): void {
  for (const r of platform.receipts) if (r.status === "pending" && r.payer.kind === "signup" && r.payer.signupId === signupId) rejectReceipt(r, "The sign-up was rejected");
}

/** Decision 15: a purged sign-up's receipt images go with its other files; the rows stay. Returns the keys to delete. */
export function forgetReceiptFiles(signupId: string): string[] {
  const keys: string[] = [];
  for (const r of platform.receipts) {
    if (r.payer.kind === "signup" && r.payer.signupId === signupId && r.fileRef) {
      keys.push(r.fileRef);
      r.fileRef = null;
    }
  }
  return keys;
}

/** Decisions 5, 23: the QR's view, or null until the operator uploads one. */
export const paymentQrView = () => (platform.paymentQr ? { caption: platform.paymentQr.caption, updatedAt: platform.paymentQr.updatedAt } : null);
