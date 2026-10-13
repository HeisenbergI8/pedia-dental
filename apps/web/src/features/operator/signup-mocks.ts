import { http, HttpResponse } from "msw";
import { PriceList, RecordUpfrontPaymentInput, RejectSignupInput, SignupInput, amountDue, type CreateAccountResult } from "@pedia/shared";
import { env } from "@/lib/env";
import { persist, platform } from "@/mocks/db";
import { brandingRefusal, createClinic, duplicateOf, fileResponse, readSignupForm, replaceFile, keepFile } from "@/mocks/signups";
import { overviewOf } from "./mocks";

const url = (p: string) => `${env.apiUrl}${p}`;
const refuse = (status: 400 | 404 | 409, message: string) => new HttpResponse(message, { status });

/** Matched against the list only, so `__proto__`-style ids are "not found" (the chunk 21 audit fix). */
const findSignup = (id: unknown) => (typeof id === "string" ? platform.signups.find((s) => s.id === id) : undefined);
const notFound = () => refuse(404, "Sign-up not found");
/** Billing #24: the upfront payment covers the quoted plan and look, so neither changes after it is recorded. */
export const PAID_PLAN_LOCKED =
  "The setup fee is already recorded for this plan and look. Keep them, or reject the sign-up and ask the clinic to sign up again.";
const stillWaiting = (s: { status: string }) => (s.status === "waiting" ? undefined : refuse(409, "This sign-up has already been decided"));

/**
 * API contract for apps/api's operator SignupController and PriceController (billing #12–#16, #23). Primolar's own
 * records: sign-ups and prices live beside the clinic accounts, never inside one. Guarded like ./mocks.ts.
 */
export const operatorSignupHandlers = [
  // Newest first. Every state; the console filters (A3).
  http.get(url("/operator/signups"), () =>
    HttpResponse.json([...platform.signups].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))),
  ),

  // The logo or a reference image, for the console's <img>. Only a key this sign-up holds.
  http.get(url("/operator/signups/:id/files/:key"), ({ params }) => {
    const signup = findSignup(params.id);
    if (!signup) return notFound();
    const key = String(params.key);
    if (key !== signup.logoRef && !signup.referenceRefs.includes(key)) return refuse(404, "That file isn't part of this sign-up");
    return fileResponse(key);
  }),

  // Billing #13: fix typos or a better logo while it waits. New reference images replace the old set. A plan or
  // branding-choice change re-quotes at today's prices (A2); otherwise the quote stands. Once the payment is recorded
  // the plan and look are locked: a re-quote would leave the clinic approved on less than it owes (billing #24).
  http.put(url("/operator/signups/:id"), async ({ params, request }) => {
    const signup = findSignup(params.id);
    if (!signup) return notFound();
    const decided = stillWaiting(signup);
    if (decided) return decided;
    const form = await readSignupForm(request, SignupInput);
    if (form instanceof Response) return form;
    const refused = brandingRefusal(form.data.branding, !!form.logo || !!signup.logoRef);
    if (refused) return refused;
    const clash = duplicateOf(form.data.account, signup.id);
    if (clash) return refuse(409, clash);
    const requote = form.data.account.tier !== signup.account.tier || form.data.branding.choice !== signup.branding.choice;
    if (requote && signup.payment) return refuse(409, PAID_PLAN_LOCKED);
    Object.assign(signup, form.data);
    if (requote) signup.quote = amountDue(platform.prices, signup.account.tier, signup.branding.choice);
    if (form.logo) signup.logoRef = await replaceFile(signup.logoRef, `${signup.id}_logo`, form.logo);
    if (form.references.length) signup.referenceRefs = await Promise.all(form.references.map((f) => keepFile(`${signup.id}_ref`, f)));
    persist();
    return HttpResponse.json(signup);
  }),

  // Billing #24, A4: the whole quoted total, in one payment, marked by hand. Once.
  http.post(url("/operator/signups/:id/payment"), async ({ params, request }) => {
    const signup = findSignup(params.id);
    if (!signup) return notFound();
    const decided = stillWaiting(signup);
    if (decided) return decided;
    if (signup.payment) return refuse(409, "The setup fee is already recorded");
    const parsed = RecordUpfrontPaymentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    signup.payment = { ...parsed.data, amount: signup.quote.total, recordedAt: new Date().toISOString() };
    persist();
    return HttpResponse.json(signup);
  }),

  // Billing #13, #14: the reason is shown to the client as written. A paid one is refunded outside the app.
  http.post(url("/operator/signups/:id/reject"), async ({ params, request }) => {
    const signup = findSignup(params.id);
    if (!signup) return notFound();
    const decided = stillWaiting(signup);
    if (decided) return decided;
    const parsed = RejectSignupInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    signup.status = "rejected";
    signup.rejection = { reason: parsed.data.reason, at: new Date().toISOString() };
    persist();
    return HttpResponse.json(signup);
  }),

  // Billing #12, #15: only after the payment, and only if the name and email are still free.
  http.post(url("/operator/signups/:id/approve"), async ({ params }) => {
    const signup = findSignup(params.id);
    if (!signup) return notFound();
    const decided = stillWaiting(signup);
    if (decided) return decided;
    if (!signup.payment) return refuse(409, "Record the setup fee before approving");
    const clash = duplicateOf(signup.account, signup.id);
    if (clash) return refuse(409, clash);
    const made = await createClinic(signup);
    const result: CreateAccountResult = { overview: overviewOf(made.clinicId), temporaryPassword: made.temporaryPassword, pin: made.pin };
    return HttpResponse.json(result, { status: 201 });
  }),

  http.get(url("/operator/prices"), () => HttpResponse.json(platform.prices)),

  // Billing #23: whole centavos, never negative. Waiting sign-ups keep their quote (A2).
  http.put(url("/operator/prices"), async ({ request }) => {
    const parsed = PriceList.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    platform.prices = parsed.data;
    persist();
    return HttpResponse.json(platform.prices);
  }),
];
