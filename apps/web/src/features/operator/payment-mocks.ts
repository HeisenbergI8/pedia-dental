import { http, HttpResponse } from "msw";
import { ConfirmReceiptInput, PaymentQrInput, QR_RULES, RejectReceiptInput } from "@pedia/shared";
import { env } from "@/lib/env";
import { deleteBlob } from "@/mocks/blob-store";
import { persist, platform } from "@/mocks/db";
import { confirmReceipt, findReceipt, imageResponse, keepImage, paymentQrView, readImageForm, receiptsToCheck, rejectReceipt, toCheck } from "@/mocks/receipts";

const url = (p: string) => `${env.apiUrl}${p}`;
const refuse = (status: 400 | 404 | 409, message: string) => new HttpResponse(message, { status });

/**
 * API contract for apps/api's PaymentQrController and OperatorReceiptsController (B12 decisions 5–8, 21–24). Primolar's
 * own records: guarded like ./mocks.ts (no tenant binding, no clinic session).
 */
export const operatorPaymentHandlers = [
  http.get(url("/operator/payment-qr"), () => HttpResponse.json(paymentQrView())),

  // Decision 5: one QR for every clinic, replaceable any time. A caption-only save keeps the image.
  http.put(url("/operator/payment-qr"), async ({ request }) => {
    const form = await readImageForm(request, PaymentQrInput, QR_RULES, false);
    if (form instanceof Response) return form;
    if (!form.file && !platform.paymentQr) return refuse(400, "Add the QR image");
    const old = platform.paymentQr?.fileRef;
    const fileRef = form.file ? await keepImage("payment_qr", form.file) : old!;
    platform.paymentQr = { fileRef, caption: form.data.caption, updatedAt: new Date().toISOString() };
    if (form.file && old) await deleteBlob(old);
    persist();
    return HttpResponse.json(paymentQrView());
  }),

  // Decision 8: Payments to check, pending only, oldest first.
  http.get(url("/operator/receipts"), () => HttpResponse.json(receiptsToCheck())),

  http.get(url("/operator/receipts/:id/image"), ({ params }) => {
    const receipt = findReceipt(params.id);
    return receipt ? imageResponse(receipt.fileRef) : refuse(404, "Receipt not found");
  }),

  // Decision 22: only for the full amount due; anything else is rejected with the reason.
  http.post(url("/operator/receipts/:id/confirm"), async ({ params, request }) => {
    const receipt = findReceipt(params.id);
    if (!receipt) return refuse(404, "Receipt not found");
    const parsed = ConfirmReceiptInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const refused = confirmReceipt(receipt, parsed.data);
    if (refused) return refuse(409, refused);
    return HttpResponse.json(toCheck(receipt));
  }),

  http.post(url("/operator/receipts/:id/reject"), async ({ params, request }) => {
    const receipt = findReceipt(params.id);
    if (!receipt) return refuse(404, "Receipt not found");
    const parsed = RejectReceiptInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const refused = rejectReceipt(receipt, parsed.data.reason);
    if (refused) return refuse(409, refused);
    return HttpResponse.json(toCheck(receipt));
  }),
];

