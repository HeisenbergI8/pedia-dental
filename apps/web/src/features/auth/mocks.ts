import { http, HttpResponse, delay } from "msw";
import { AcknowledgeInput, ChangePasswordInput, LoginInput, LogoutInput, SwitchUserInput, pinLockout, rolesCan, worksAt, type AuditAction, type Session, type SessionUser } from "@pedia/shared";
import { env } from "@/lib/env";
import { branchOf, recordAudit, sessionOf } from "@/mocks/access";
import { accountById, credentialOf, db, persist, platform, selectTenant } from "@/mocks/db";
import { DEMO_PASSWORD, accountsByLogin, allAccounts, demoAccounts, demoLogins, passwordOpens, portalAccountOf, tokenFor, type AccountMatch, type DemoAccountRecord } from "@/mocks/demo-accounts";
import { acknowledgementPrompt, expectedVersion, pendingAcknowledgement, recordAcknowledgement } from "@/mocks/privacy";
import { DEMO_CLINIC_ID, onlineAgreement } from "@pedia/seed";
import { billingOnlyFor } from "@/mocks/subscriptions";

const url = (p: string) => `${env.apiUrl}${p}`;

export const userOf = (account: DemoAccountRecord, clinicId: string): SessionUser => {
  const { id, role, name, email, staffId, guardianId, roles } = account;
  return {
    id,
    role,
    name,
    email,
    clinicId,
    roles,
    readOnly: accountById(clinicId)?.status === "active" || billingOnlyFor(account, clinicId) ? undefined : true,
    billingOnly: billingOnlyFor(account, clinicId) || undefined, // B12 decision 25
    mustChangePassword: credentialOf(platform.tenants[clinicId]!, staffId)?.mustChange || undefined,
    mustAcknowledge: pendingAcknowledgement(account, clinicId), // privacy P10
    staffId,
    guardianId,
  };
};

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
    const matches = accountsByLogin(platform, email); // `email` holds a mobile or an email (LoginId, B11 decision 4)
    // Each failure is logged in the account it names (an unknown email has no one to log against).
    const logEach = (rows: AccountMatch[], action: AuditAction, record = "Session") =>
      rows.forEach((m) => {
        selectTenant(m.clinicId);
        recordAudit(m.account, action, record);
      });
    // One message for both cases, so the form doesn't reveal which emails exist.
    const opened = matches.filter((m) => passwordOpens(platform.tenants[m.clinicId]!, m.account, password));
    if (opened.length === 0) {
      logEach(matches, "sign_in_failed");
      return new HttpResponse("That mobile number or email and password don't match a demo account", { status: 401 });
    }
    // Checked after the password, so a stranger can't learn that an account is suspended. A suspended account's staff
    // are refused; its parents still sign in, read-only (decisions #26, #44).
    // B12 decision 25: the Owner of a clinic paused for non-payment signs in to pay.
    const open = opened.filter((m) => accountById(m.clinicId)?.status === "active" || m.account.role === "parent" || billingOnlyFor(m.account, m.clinicId));
    if (open.length === 0) {
      logEach(opened, "denied", "Session (account suspended)");
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
   * Changes the signed-in person's password: a staff login at first sign-in with the temporary one (decision #21) or
   * any time after; a parent any time (B11 decision 7). Seeded demo logins keep the demo password.
   * Outside the access gate (/auth/*), which is what lets a login that must change its password reach it.
   * Returns the session again so the app drops `mustChangePassword` without a new sign-in.
   */
  http.post(url("/auth/password"), async ({ request }) => {
    const session = sessionOf(request);
    if (!session) return new HttpResponse("Sign in to change your password", { status: 401 });
    // Seeded demo logins keep the password the login screen shows; only logins the Owner added, and parents who set
    // one from a link, have their own.
    const staffOwn = session.staffId ? credentialOf(db, session.staffId) : undefined;
    const parentOwn = session.guardianId ? portalAccountOf(db, session.guardianId) : undefined;
    if (!staffOwn && !parentOwn?.password) return new HttpResponse(`Demo logins keep the demo password (${DEMO_PASSWORD})`, { status: 403 });
    const parsed = ChangePasswordInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    if (!passwordOpens(db, session, parsed.data.current)) {
      recordAudit(session, "denied", "Password");
      return new HttpResponse("That isn't your current password", { status: 400 });
    }
    if (staffOwn) Object.assign(staffOwn, { password: parsed.data.next, mustChange: false });
    else parentOwn!.password = parsed.data.next;
    persist();
    recordAudit(session, "update", "Password");
    const fresh: Session = { token: tokenFor(session.clinicId, session), user: userOf(session, session.clinicId) };
    return HttpResponse.json(fresh);
  }),

  /** Privacy P10: the page this login must read before continuing. Outside the gate (/auth/*), like /auth/password. */
  http.get(url("/auth/acknowledgement"), ({ request }) => {
    const session = sessionOf(request);
    if (!session) return new HttpResponse("Sign in to continue", { status: 401 });
    if (!session.mustAcknowledge) return new HttpResponse("Nothing is waiting for you to read", { status: 409 });
    return HttpResponse.json(acknowledgementPrompt(session.mustAcknowledge, session, session.clinicId));
  }),

  /**
   * Privacy #9, #20, #21, #23: accepts the Terms and DPA (a new agreement), or acknowledges confidentiality or the
   * clinic's notice. Only the step waiting, at its current version, so a stale page can't accept an old text.
   * Returns the session again, with the next step (or none).
   */
  http.post(url("/auth/acknowledgement"), async ({ request }) => {
    const session = sessionOf(request);
    if (!session) return new HttpResponse("Sign in to continue", { status: 401 });
    if (session.mustChangePassword) return new HttpResponse("Choose your own password to continue", { status: 403 });
    const parsed = AcknowledgeInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { kind, version } = parsed.data;
    if (kind !== session.mustAcknowledge || version !== expectedVersion(kind, db)) {
      return new HttpResponse("That isn't the version waiting for you. Reload the page and read it again.", { status: 409 });
    }
    if (kind === "terms") {
      platform.agreements.push({ clinicId: session.clinicId, ...onlineAgreement(session.name) });
      recordAudit(session, "create", "Terms and DPA (accepted)");
    } else {
      recordAcknowledgement(db, session.clinicId, session, kind, version);
      recordAudit(session, "create", kind === "notice" ? "Privacy notice (acknowledged)" : "Confidentiality (acknowledged)");
    }
    persist();
    const fresh: Session = { token: tokenFor(session.clinicId, session), user: userOf(session, session.clinicId) };
    return HttpResponse.json(fresh);
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
    // A new login hands the device on only after choosing its own password (decision #21), like every other route.
    if (current.mustChangePassword) return new HttpResponse("Choose your own password to continue", { status: 403 });
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
