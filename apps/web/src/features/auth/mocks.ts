import { http, HttpResponse, delay } from "msw";
import { LoginInput, LogoutInput, SwitchUserInput, pinLockout, rolesCan, worksAt, type AuditAction, type Session, type SessionUser } from "@pedia/shared";
import { env } from "@/lib/env";
import { branchOf, recordAudit, sessionOf } from "@/mocks/access";
import { accountById, db, persist, platform, selectTenant } from "@/mocks/db";
import { DEMO_PASSWORD, accountsByEmail, allAccounts, demoAccounts, demoLogins, tokenFor, type AccountMatch, type DemoAccountRecord } from "@/mocks/demo-accounts";
import { DEMO_CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

const userOf = ({ id, role, name, email, staffId, guardianId, roles }: DemoAccountRecord, clinicId: string): SessionUser => ({
  id,
  role,
  name,
  email,
  clinicId,
  roles,
  readOnly: accountById(clinicId)?.status === "active" ? undefined : true,
  staffId,
  guardianId,
});

/** How a PIN switch reads in the audit trail. */
const PIN_SWITCH = "Session (PIN switch)";
const lockedMessage = (until: string) => {
  const minutes = Math.max(1, Math.ceil((Date.parse(until) - Date.now()) / 60_000));
  return `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or sign out and sign in with your password.`;
};

/** API contract for apps/api's AuthController. `/auth/demo-accounts` is prototype-only. */
export const authHandlers = [
  // Signed in: this account's people (the Switch user PIN hints). Signed out: the demo clinic's.
  http.get(url("/auth/demo-accounts"), async ({ request }) => {
    await delay(100);
    if (!sessionOf(request)) selectTenant(DEMO_CLINIC_ID);
    const accounts = demoAccounts(db).map(({ id, role, name, email, summary, pin }) => ({ id, role, name, email, summary, pin }));
    return HttpResponse.json({ password: DEMO_PASSWORD, accounts, logins: demoLogins(platform) });
  }),

  // No simulated latency: it was dead time between the click and the next page.
  http.post(url("/auth/login"), async ({ request }) => {
    const parsed = LoginInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { email, password, clinicId } = parsed.data;
    const matches = accountsByEmail(platform, email);
    // Each failure is logged in the account it names (an unknown email has no one to log against).
    const logEach = (rows: AccountMatch[], action: AuditAction, record = "Session") =>
      rows.forEach((m) => {
        selectTenant(m.clinicId);
        recordAudit(m.account, action, record);
      });
    // One message for both cases, so the form doesn't reveal which emails exist.
    if (matches.length === 0 || password !== DEMO_PASSWORD) {
      logEach(matches, "sign_in_failed");
      return new HttpResponse("That email and password don't match a demo account", { status: 401 });
    }
    // Checked after the password, so a stranger can't learn that an account is suspended. A suspended account's staff
    // are refused; its parents still sign in, read-only (decisions #26, #44).
    const open = matches.filter((m) => accountById(m.clinicId)?.status === "active" || m.account.role === "parent");
    if (open.length === 0) {
      logEach(matches, "denied", "Session (account suspended)");
      return new HttpResponse("Your clinic's Primolar account is paused. Contact your clinic.", { status: 403 });
    }
    const match = clinicId ? open.find((m) => m.clinicId === clinicId) : open.length === 1 ? open[0] : undefined;
    if (!match) {
      if (clinicId) return new HttpResponse("Choose one of your clinics", { status: 400 });
      return HttpResponse.json({ choices: open.map((m) => ({ clinicId: m.clinicId, name: accountById(m.clinicId)!.name })) });
    }
    selectTenant(match.clinicId);
    recordAudit(match.account, "sign_in", "Session");
    const session: Session = { token: tokenFor(match.clinicId, match.account), user: userOf(match.account, match.clinicId) };
    return HttpResponse.json(session);
  }),

  http.get(url("/auth/me"), ({ request }) => {
    const session = sessionOf(request);
    return session ? HttpResponse.json(userOf(session, session.clinicId)) : new HttpResponse("Sign in to continue", { status: 401 });
  }),

  // Nothing to revoke: the token is the account id. NestJS clears its cookie here.
  http.post(url("/auth/logout"), async ({ request }) => {
    const session = sessionOf(request);
    const { reason } = LogoutInput.parse(await request.json().catch(() => ({})));
    if (session) recordAudit(session, reason === "idle" ? "timed_out" : "sign_out", "Session");
    return HttpResponse.json({});
  }),

  /**
   * Hands a shared device to another staff member, who proves it's them with their own PIN (own account, never a
   * shared login, never just a tap on a name). Needs a staff session already on the device. Logged as the old
   * person signing out and the new one signing in, so the trail always says who was acting.
   * Outside the access gate (/auth/*), so it checks the session and permission itself.
   */
  http.post(url("/auth/switch"), async ({ request }) => {
    const current = sessionOf(request);
    if (!current) return new HttpResponse("Sign in to continue", { status: 401 });
    if (!rolesCan(current.roles, "session.switch")) return new HttpResponse("Switching user is for clinic staff", { status: 403 });
    const parsed = SwitchUserInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });

    // Only staff have a PIN, so a parent account can never be switched to (data, not a role check).
    const target = allAccounts(db).find((a) => a.id === parsed.data.accountId);
    const pin = target?.staffId ? db.staffPins.find((p) => p.staffId === target.staffId) : undefined;
    if (!target || !pin) return new HttpResponse("Choose a staff member from the list", { status: 400 });
    // Only staff who work at this device's branch (decision #24). Not a PIN attempt, so before the lockout check.
    const staff = db.staff.find((s) => s.id === target.staffId)!;
    const device = branchOf(current);
    if (!worksAt(staff, device)) {
      return new HttpResponse(`${target.name} doesn't work at ${device.name}. They can sign in with their password.`, { status: 400 });
    }

    const lock = pinLockout(pin.failedAt, new Date());
    if (lock.locked) {
      recordAudit(target, "denied", PIN_SWITCH);
      return new HttpResponse(lockedMessage(lock.until), { status: 429 });
    }
    if (parsed.data.pin !== pin.pin) {
      pin.failedAt.push(new Date().toISOString());
      persist();
      recordAudit(target, "sign_in_failed", PIN_SWITCH);
      const after = pinLockout(pin.failedAt, new Date());
      if (after.locked) return new HttpResponse(lockedMessage(after.until), { status: 429 });
      const tries = `${after.attemptsLeft} ${after.attemptsLeft === 1 ? "try" : "tries"} left`;
      return new HttpResponse(`That PIN isn't right for ${target.name}. ${tries}.`, { status: 401 });
    }

    pin.failedAt = [];
    persist();
    recordAudit(current, "sign_out", "Session (switched user)");
    recordAudit(target, "sign_in", PIN_SWITCH);
    const session: Session = { token: tokenFor(current.clinicId, target), user: userOf(target, current.clinicId) };
    return HttpResponse.json(session);
  }),
];
