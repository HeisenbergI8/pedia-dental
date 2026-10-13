import { http, HttpResponse } from "msw";
import { SignupInput } from "@pedia/shared";
import { env } from "@/lib/env";
import { platform } from "@/mocks/db";
import { addSignup, brandingRefusal, duplicateOf, readSignupForm, statusView } from "@/mocks/signups";

const url = (p: string) => `${env.apiUrl}${p}`;

/**
 * API contract for apps/api's public SignupController (billing #4): no sign-in, no clinic, no operator. These read and
 * write Primolar's own records only; the source guard in mocks/operator.test.ts checks this file too.
 */
export const signupHandlers = [
  // The plans' prices, for the form's running total (billing #23). Registered before :reference.
  http.get(url("/signups/prices"), () => HttpResponse.json(platform.prices)),

  // Billing #10–#11: refused on a duplicate with "contact Primolar"; otherwise waiting for its setup fee.
  http.post(url("/signups"), async ({ request }) => {
    const form = await readSignupForm(request, SignupInput);
    if (form instanceof Response) return form;
    const refused = brandingRefusal(form.data.branding, !!form.logo);
    if (refused) return refused;
    const clash = duplicateOf(form.data.account);
    if (clash) return new HttpResponse(clash, { status: 409 });
    const signup = await addSignup(form.data, form, "form");
    return HttpResponse.json(statusView(signup), { status: 201 });
  }),

  // A1: the thank-you page and later checks. Console-made sign-ups have no client page, so they aren't found here.
  http.get(url("/signups/:reference"), ({ params }) => {
    const reference = String(params.reference).trim().toUpperCase();
    const signup = platform.signups.find((s) => s.reference === reference && s.source === "form");
    if (!signup) return new HttpResponse("We can't find a sign-up with that reference. Check it and try again.", { status: 404 });
    return HttpResponse.json(statusView(signup));
  }),
];
