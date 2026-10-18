import { http, HttpResponse } from "msw";
import { GetStartedInput, RECEIPT_RULES, ReceiptUploadInput, SIGNUP_LIMIT_MESSAGE } from "@pedia/shared";
import { env } from "@/lib/env";
import { platform } from "@/mocks/db";
import { onlineAgreement } from "@pedia/seed";
import { addSignupReceipt, imageResponse, readImageForm } from "@/mocks/receipts";
import { addSignup, brandingRefusal, duplicateOf, readSignupForm, signupHitAllowed, statusView } from "@/mocks/signups";

const url = (p: string) => `${env.apiUrl}${p}`;
const byReference = (reference: unknown) => {
  const ref = String(reference).trim().toUpperCase();
  return platform.signups.find((s) => s.reference === ref && s.source === "form");
};
const NOT_FOUND = () => new HttpResponse("We can't find a sign-up with that reference. Check it and try again.", { status: 404 });

/**
 * API contract for apps/api's public SignupController (billing #4): no sign-in, no clinic, no operator. These read and
 * write Primolar's own records only; the source guard in mocks/operator.test.ts checks this file too.
 */
export const signupHandlers = [
  // The plans' prices, for the form's running total (billing #23). Registered before :reference.
  http.get(url("/signups/prices"), () => HttpResponse.json(platform.prices)),

  // Billing #10–#11: refused on a duplicate with "contact Primolar"; otherwise waiting for its setup fee.
  http.post(url("/signups"), async ({ request }) => {
    if (!signupHitAllowed()) return new HttpResponse(SIGNUP_LIMIT_MESSAGE, { status: 429 }); // B12 decision 14: before reading
    const form = await readSignupForm(request, GetStartedInput); // privacy #7: refused (400) without the acceptance
    if (form instanceof Response) return form;
    const refused = brandingRefusal(form.data.branding, !!form.logo);
    if (refused) return refused;
    const clash = duplicateOf(form.data.account);
    if (clash) return new HttpResponse(clash, { status: 409 });
    const signup = await addSignup(form.data, form, "form", onlineAgreement(form.data.owner.fullName)); // P4
    return HttpResponse.json(statusView(signup), { status: 201 });
  }),

  // B12 decisions 5, 23: Primolar's payment QR, public (a payment QR is meant to be shared). Before :reference.
  http.get(url("/signups/payment-qr/image"), () =>
    platform.paymentQr ? imageResponse(platform.paymentQr.fileRef) : new HttpResponse("Primolar hasn't added payment details yet", { status: 404 }),
  ),

  // A1: the thank-you page and later checks. Console-made sign-ups have no client page, so they aren't found here.
  http.get(url("/signups/:reference"), ({ params }) => {
    const signup = byReference(params.reference);
    if (!signup) return NOT_FOUND();
    return HttpResponse.json(statusView(signup));
  }),

  // B12 decision 7: the receipt for the whole quote, from the status page. The operator confirms it before approving.
  http.post(url("/signups/:reference/receipts"), async ({ params, request }) => {
    const signup = byReference(params.reference);
    if (!signup) return NOT_FOUND();
    const form = await readImageForm(request, ReceiptUploadInput, RECEIPT_RULES, true);
    if (form instanceof Response) return form;
    const refused = await addSignupReceipt(signup.id, form.data.reference, form.file!);
    if (refused) return new HttpResponse(refused, { status: 409 });
    return HttpResponse.json(statusView(signup), { status: 201 });
  }),
];
