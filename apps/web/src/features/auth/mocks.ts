import { http, HttpResponse, delay } from "msw";
import { LoginInput, LogoutInput, type Session, type SessionUser } from "@pedia/shared";
import { env } from "@/lib/env";
import { recordAudit, sessionOf } from "@/mocks/access";
import { db } from "@/mocks/db";
import { DEMO_PASSWORD, allAccounts, demoAccounts, tokenFor, type DemoAccountRecord } from "@/mocks/demo-accounts";

const url = (p: string) => `${env.apiUrl}${p}`;

const userOf = ({ id, role, name, email, staffId, guardianId }: DemoAccountRecord): SessionUser => ({
  id,
  role,
  name,
  email,
  staffId,
  guardianId,
});

/** API contract for apps/api's AuthController. `/auth/demo-accounts` is prototype-only. */
export const authHandlers = [
  http.get(url("/auth/demo-accounts"), async () => {
    await delay(100);
    const accounts = demoAccounts(db).map(({ id, role, name, email, summary }) => ({ id, role, name, email, summary }));
    return HttpResponse.json({ password: DEMO_PASSWORD, accounts });
  }),

  // No simulated latency: it was dead time between the click and the next page.
  http.post(url("/auth/login"), async ({ request }) => {
    const parsed = LoginInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const account = allAccounts(db).find((a) => a.email === parsed.data.email);
    // One message for both cases, so the form doesn't reveal which emails exist.
    if (!account || parsed.data.password !== DEMO_PASSWORD) {
      if (account) recordAudit(account, "sign_in_failed", "Session"); // an unknown email has no one to log against
      return new HttpResponse("That email and password don't match a demo account", { status: 401 });
    }
    recordAudit(account, "sign_in", "Session");
    const session: Session = { token: tokenFor(account), user: userOf(account) };
    return HttpResponse.json(session);
  }),

  http.get(url("/auth/me"), ({ request }) => {
    const session = sessionOf(request);
    return session ? HttpResponse.json(userOf(session)) : new HttpResponse("Sign in to continue", { status: 401 });
  }),

  // Nothing to revoke: the token is the account id. NestJS clears its cookie here.
  http.post(url("/auth/logout"), async ({ request }) => {
    const session = sessionOf(request);
    const { reason } = LogoutInput.parse(await request.json().catch(() => ({})));
    if (session) recordAudit(session, reason === "idle" ? "timed_out" : "sign_out", "Session");
    return HttpResponse.json({});
  }),
];
