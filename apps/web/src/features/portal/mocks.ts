import { http, HttpResponse } from "msw";
import {
  DemoTexts, PORTAL_LINK_LIFETIME_MS, PasswordLinkInput, PasswordResetInput, RESET_TEXTS_PER_HOUR, SetPasswordInput,
  accountText, isAccountText, linkPath, maskedNumber, smsNumber,
  type Guardian, type PortalAccess, type PortalAccount, type PortalLinkRecord, type Session,
} from "@pedia/shared";
import { DEMO_CLINIC_ID } from "@pedia/seed";
import { env } from "@/lib/env";
import { userOf } from "@/features/auth/mocks";
import { recordAudit, sessionOf } from "@/mocks/access";
import { currentAccount, currentClinicId, db, persist, platform, selectTenant } from "@/mocks/db";
import { accountsByLogin, allAccounts, emailTaken, portalAccountOf, tokenFor } from "@/mocks/demo-accounts";

const url = (p: string) => `${env.apiUrl}${p}`;
const stamp = () => new Date().toISOString();

/** 24 random bytes, base64url: the 32 characters PasswordLinkInput takes. */
export const newToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, "-").replace(/\//g, "_");

const guardianOf = (guardianId: string): Guardian | undefined => db.patients.flatMap((p) => p.guardians).find((g) => g.id === guardianId);
const liveLink = (l: PortalLinkRecord) => !l.usedAt && !l.cancelledAt && Date.parse(l.expiresAt) > Date.now();

/** Decision 14: another guardian of this account who signs in with, or was invited on, this number. */
function numberHolder(number: string, exceptGuardianId: string, states: PortalAccount["state"][] = ["active", "invited"]) {
  return db.portalAccounts
    .filter((a) => a.guardianId !== exceptGuardianId && states.includes(a.state))
    .map((a) => guardianOf(a.guardianId))
    .find((g) => g && smsNumber(g.phone) === number);
}
const clashText = (g: Pick<Guardian, "phone">, holder: Guardian) =>
  `${maskedNumber(g.phone)} already signs in to the portal as ${holder.fullName}. Each parent needs their own mobile number.`;

/** Why this guardian can't be invited now (decisions 1, 14), in the words the Overview shows. */
function blockedReason(g: Guardian): string | undefined {
  const n = smsNumber(g.phone);
  if (!n) return `Add a mobile number for ${g.fullName} to invite them`;
  const holder = numberHolder(n, g.id);
  return holder && clashText(g, holder);
}

/**
 * Decision 14 on a contact edit: a guardian with portal access (invited or active) can't move to a number another
 * parent of the account signs in with. Undefined when the edit may go ahead.
 */
export function portalNumberClash(g: Pick<Guardian, "id" | "phone">): string | undefined {
  const mine = portalAccountOf(db, g.id);
  const n = smsNumber(g.phone);
  if (!n || !mine || mine.state === "off") return undefined;
  const holder = numberHolder(n, g.id);
  return holder && clashText(g, holder);
}

function portalAccessOf(g: Guardian): PortalAccess {
  const a = portalAccountOf(db, g.id);
  const invite = a?.links.filter((l) => l.purpose === "invite" && !l.cancelledAt).at(-1);
  return {
    guardianId: g.id,
    state: a?.state ?? "not_invited",
    invitedAt: a?.invitedAt,
    inviteExpiresAt: a?.state === "invited" ? invite?.expiresAt : undefined,
    activatedAt: a?.state === "active" ? a.activatedAt : undefined,
    turnedOffAt: a?.state === "off" ? a.turnedOffAt : undefined,
    blocked: a?.state === "active" ? undefined : blockedReason(g),
  };
}

/** A new link of this purpose; the older live ones are cancelled (decision 5: a resend cancels the older link). */
function newLink(a: PortalAccount, purpose: PortalLinkRecord["purpose"]): void {
  const at = new Date();
  for (const l of a.links) if (l.purpose === purpose && liveLink(l)) l.cancelledAt = at.toISOString();
  a.links.push({ token: newToken(), purpose, createdAt: at.toISOString(), expiresAt: new Date(at.getTime() + PORTAL_LINK_LIFETIME_MS[purpose]).toISOString() });
}

/** Withdraws this guardian's waiting account texts (the API matches them by link; the mock never sends anyway). */
const withdrawTexts = (g: Guardian) => {
  for (const m of db.messages) if (isAccountText(m.kind) && m.to === g.phone && m.status === "queued") m.status = "cancelled";
};

/** E4: the log's row for an account text: this guardian's own number, now, whatever the consents, the link as [link]. */
function logAccountText(kind: "portal_invite" | "password_reset", g: Guardian, patientId: string, childName?: string) {
  const at = stamp();
  const body = accountText(kind === "portal_invite" ? "invite" : "reset", { clinicName: currentAccount().name, childName });
  db.messages.push({ id: crypto.randomUUID(), clinicId: currentClinicId(), patientId, kind, channel: "sms", to: g.phone, recipientName: g.fullName, body, status: "queued", sendAt: at, createdAt: at });
}

/** The child and the guardian a staff route names: 404s as the API words them. */
function familyOf(params: Record<string, string | readonly string[] | undefined>) {
  const patient = db.patients.find((p) => p.id === params.id);
  if (!patient) return new HttpResponse("Patient not found", { status: 404 });
  const guardian = patient.guardians.find((g) => g.id === params.guardianId);
  if (!guardian) return new HttpResponse(`This guardian isn't on ${patient.firstName}'s record`, { status: 404 });
  return { patient, guardian };
}

/** The link a token names, in whichever account holds it; points `db` at that account. */
function linkOf(token: string) {
  for (const { id } of platform.accounts) {
    for (const account of platform.tenants[id]!.portalAccounts) {
      const link = account.links.find((l) => l.token === token);
      if (link) return selectTenant(id) && { clinicId: id, account, link };
    }
  }
}
/** Usable: live, and the account in the state the purpose needs (an invite: invited; a reset: active). */
function usableLink(token: string) {
  const hit = linkOf(token);
  const guardian = hit && guardianOf(hit.account.guardianId);
  const wanted = hit?.link.purpose === "invite" ? "invited" : "active";
  return hit && guardian && liveLink(hit.link) && hit.account.state === wanted ? { ...hit, guardian } : undefined;
}
const GONE = () => new HttpResponse("This link has expired or was already used.", { status: 410 });

/** Decision 19: reset texts per sign-in value in the last hour, counted whether or not an account exists. In memory. */
const resetTexts = new Map<string, number[]>();

/** API contract for apps/api's PortalAccessController and PasswordLinksController (B11). */
export const portalHandlers = [
  // Staff with portal.manage (mocks/access.ts): each guardian's portal status, on the child's Overview (decision 17).
  http.get(url("/patients/:id/portal-access"), ({ params }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    return HttpResponse.json(patient.guardians.map(portalAccessOf));
  }),

  // Invite or resend (decisions 1, 2, 5, 14, 20): any guardian of this child with a mobile no other parent uses.
  http.post(url("/patients/:id/guardians/:guardianId/portal-invite"), ({ params, request }) => {
    const found = familyOf(params);
    if (found instanceof Response) return found;
    const { patient, guardian: g } = found;
    let a = portalAccountOf(db, g.id);
    if (a?.state === "active") return new HttpResponse(`${g.fullName} already uses the portal`, { status: 409 });
    const blocked = blockedReason(g);
    if (blocked) return new HttpResponse(blocked, { status: 409 });
    if (!a) db.portalAccounts.push((a = { clinicId: currentClinicId(), guardianId: g.id, state: "invited", links: [] }));
    Object.assign(a, { state: "invited", invitedAt: stamp(), invitedBy: sessionOf(request)!.name, turnedOffAt: undefined });
    withdrawTexts(g);
    newLink(a, "invite");
    logAccountText("portal_invite", g, patient.id, patient.firstName);
    persist();
    return HttpResponse.json(portalAccessOf(g));
  }),

  // Turn off (decision 18): no longer a login (allAccounts), links cancelled; they can be invited again.
  http.post(url("/patients/:id/guardians/:guardianId/portal-off"), ({ params }) => {
    const found = familyOf(params);
    if (found instanceof Response) return found;
    const { guardian: g } = found;
    const a = portalAccountOf(db, g.id);
    if (!a || a.state === "off") return new HttpResponse(`${g.fullName} doesn't have portal access`, { status: 409 });
    withdrawTexts(g);
    for (const l of a.links) if (liveLink(l)) l.cancelledAt = stamp();
    Object.assign(a, { state: "off", turnedOffAt: stamp(), password: undefined, email: undefined });
    persist();
    return HttpResponse.json(portalAccessOf(g));
  }),

  // Signed out (/auth/*: outside the gate). What a link is for; one 410 for unknown, used, cancelled and expired (E1).
  http.post(url("/auth/password-link"), async ({ request }) => {
    const parsed = PasswordLinkInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const hit = usableLink(parsed.data.token);
    if (!hit) return GONE();
    return HttpResponse.json({ purpose: hit.link.purpose, name: hit.guardian.fullName, clinicName: currentAccount().name, login: maskedNumber(hit.guardian.phone) });
  }),

  // Sets the password and signs in (decisions 5, 6, 8, 22). Single use. A first sign-in comes back with mustAcknowledge "notice".
  http.post(url("/auth/password-link/accept"), async ({ request }) => {
    const parsed = SetPasswordInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const hit = usableLink(parsed.data.token);
    if (!hit) return GONE();
    const { account: a, link, guardian: g, clinicId } = hit;
    if (link.purpose === "invite") {
      const n = smsNumber(g.phone);
      if (!n) return new HttpResponse("Your clinic needs your mobile number first. Ask them to add it and send a new invite.", { status: 409 });
      const holder = numberHolder(n, g.id, ["active"]);
      if (holder) return new HttpResponse(clashText(g, holder), { status: 409 });
      const email = g.email?.toLowerCase();
      // Decision 14: a shared email isn't refused; this parent then signs in with their number only.
      Object.assign(a, { state: "active", activatedAt: stamp(), email: email && !emailTaken(db, email) ? email : undefined });
    }
    a.password = parsed.data.password; // as typed: the prototype's deferral (the API stores argon2id)
    link.usedAt = stamp();
    persist();
    const login = allAccounts(db).find((x) => x.guardianId === g.id)!;
    recordAudit(login, "update", link.purpose === "invite" ? "Portal access (activated)" : "Password (reset)");
    const session: Session = { token: tokenFor(clinicId, login), user: userOf(login, clinicId) };
    return HttpResponse.json(session);
  }),

  // Forgot password (decisions 6, 19): 202 {} whether or not an account exists; counted first, so 429 says nothing either.
  http.post(url("/auth/password-reset"), async ({ request }) => {
    const parsed = PasswordResetInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { login } = parsed.data;
    const recent = (resetTexts.get(login) ?? []).filter((t) => t > Date.now() - 3_600_000);
    if (recent.length >= RESET_TEXTS_PER_HOUR) return new HttpResponse("Too many reset texts for this number. Try again later.", { status: 429 });
    resetTexts.set(login, [...recent, Date.now()]);
    for (const m of accountsByLogin(platform, login)) {
      if (!m.account.guardianId) continue; // parents only (decision 6): staff ask their Owner
      selectTenant(m.clinicId);
      const a = portalAccountOf(db, m.account.guardianId)!;
      const g = guardianOf(a.guardianId)!;
      if (!smsNumber(g.phone)) continue;
      withdrawTexts(g); // only the newest reset text matters
      newLink(a, "reset");
      logAccountText("password_reset", g, db.patients.find((p) => p.guardians.some((x) => x.id === g.id))!.id);
      recordAudit(m.account, "create", "Password reset (requested)");
    }
    persist();
    return HttpResponse.json({}, { status: 202 });
  }),

  // Prototype and demo deployments only (E6): the live links the demo would have texted, newest first, at most 5.
  http.get(url("/auth/demo-texts"), ({ request }) => {
    if (!sessionOf(request)) selectTenant(DEMO_CLINIC_ID);
    const texts = db.portalAccounts
      .flatMap((a) => a.links.filter(liveLink).map((l) => ({ name: guardianOf(a.guardianId)?.fullName ?? "A parent", purpose: l.purpose, link: linkPath(l.token), expiresAt: l.expiresAt, at: l.createdAt })))
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, 5)
      .map(({ at: _at, ...t }) => t);
    return HttpResponse.json(DemoTexts.parse({ texts }));
  }),
];
