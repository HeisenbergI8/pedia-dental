import { http, HttpResponse } from "msw";
import { ALL_BRANCHES, TIER_LIMITS, permissionScopeFor, reportBranchFilter, usableBranches, type AcknowledgementKind, type AuditAction, type Branch, type OperatorUser, type Permission } from "@pedia/shared";
import { env } from "@/lib/env";
import { accountById, credentialOf, currentAccount, currentClinicId, db, persist, platform, selectTenant } from "./db";
import { accountForToken, childrenOf, type DemoAccountRecord } from "./demo-accounts";
import { OPERATOR_COOKIE, operatorForToken } from "./operator";
import { pendingAcknowledgement } from "./privacy";
import { settleSubscriptions } from "./subscriptions";

const url = (p: string) => `${env.apiUrl}${p}`;
export const SESSION_COOKIE = "pd_session";
/** The branch this device is working at, written by the session store like the session cookie. */
export const BRANCH_COOKIE = "pd_branch";

export type MockSession = DemoAccountRecord & {
  clinicId: string;
  patientIds: Set<string>;
  readOnly: boolean;
  mustChangePassword: boolean;
  mustAcknowledge: AcknowledgementKind | undefined; // privacy P10
};

const deny = (status: 401 | 403, message: string) => new HttpResponse(message, { status });

/** MSW runs handlers in the page, so the cookies the session store wrote are readable. Tests stub `document`. */
function cookie(name: string): string | undefined {
  const cookies = typeof document === "undefined" ? "" : document.cookie;
  return cookies
    .split(/;\s*/)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/** The bearer header (scripts) or the cookie (the browser, including <img> requests): the clinic's, or the operator's. */
function tokenOf(request: Request, cookieName = SESSION_COOKIE): string | undefined {
  return request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? cookie(cookieName);
}

/** The Primolar operator calling, if any. Never selects a tenant: the operator isn't in one (decision #25). */
export const operatorOf = (request: Request): OperatorUser | undefined => operatorForToken(tokenOf(request, OPERATOR_COOKIE));

/**
 * Who is calling, and in which clinic account. Also points `db` at that account's data (`selectTenant`), so every
 * read and write after this, in this request, is scoped to it. The access gate calls this first on every route;
 * /auth/* handlers call it themselves.
 */
export function sessionOf(request: Request): MockSession | undefined {
  const found = accountForToken(platform, tokenOf(request));
  if (!found) return undefined;
  // Staff of a suspended account are signed out on their next request (#41); its parents read on (#44).
  const suspended = accountById(found.clinicId)?.status !== "active";
  if (suspended && found.account.role !== "parent") return undefined;
  selectTenant(found.clinicId);
  const { account, clinicId } = found;
  const children = account.guardianId ? childrenOf(db, account.guardianId) : [];
  const mustChangePassword = !!credentialOf(db, account.staffId)?.mustChange;
  return { ...account, clinicId, patientIds: new Set(children.map((p) => p.id)), readOnly: suspended, mustChangePassword, mustAcknowledge: pendingAcknowledgement(account, clinicId) };
}

/** The branches this caller may work at: the Owner every open one, staff their assignments, parents every open one. */
export function usableBranchesOf(session: MockSession): Branch[] {
  const staff = session.staffId ? db.staff.find((s) => s.id === session.staffId) : undefined;
  return usableBranches(session.roles, staff?.branchIds, db.branches);
}

/**
 * The branch this device is working at: the `pd_branch` cookie when it is one the caller may use, else their first.
 * A cookie naming another account's branch, an archived one or a made-up id is ignored, never trusted.
 */
export function branchOf(session: MockSession): Branch {
  const usable = usableBranchesOf(session);
  return usable.find((b) => b.id === cookie(BRANCH_COOKIE)) ?? usable[0]!;
}

/** For handlers behind the access gate, where a session is guaranteed: the branch-level lists' branch. */
export const activeBranch = (request: Request): Branch => branchOf(sessionOf(request)!);

/**
 * The branches a report covers (decision #20), from `?branch=`: absent or the device's own branch → that branch;
 * `all` → every branch of the account, archived ones included (their history stays in reports, #22), for the Owner;
 * another branch id → that branch, when the caller works there. Anything wider than the device's branch needs a
 * tier with cross-branch views (#6). A refusal is a 403 the handler returns as is. Behind the gate only.
 */
export function reportBranches(request: Request): string[] | Response {
  const session = sessionOf(request)!;
  const device = branchOf(session);
  const asked = new URL(request.url).searchParams.get("branch");
  if (!asked || asked === device.id) return [device.id];
  const { tier } = currentAccount();
  if (!TIER_LIMITS[tier].crossBranchViews) return deny(403, "Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade.");
  const filter = reportBranchFilter(tier, session.roles, usableBranchesOf(session));
  if (!filter) return deny(403, "Reports across branches need two open branches you work at");
  if (asked === ALL_BRANCHES) return filter.all ? db.branches.map((b) => b.id) : deny(403, "Only the clinic's Owner sees all branches together");
  return filter.branches.some((b) => b.id === asked) ? [asked] : deny(403, "You don't work at that branch");
}

/** For handlers the gate passed as "filtered": may this caller see this patient's row? */
export function inScope(session: MockSession | undefined, permission: Permission, patientId: string) {
  const scope = session && permissionScopeFor(session.roles, permission);
  return scope === "all" || (scope === "own" && session!.patientIds.has(patientId));
}

/** Which patient a request is about, for `own`-scoped callers. */
type Owner = ((params: Record<string, string>, url: URL) => string | undefined) | "filtered";
/** `audit` names the record in the audit trail; routes without one (reference data) aren't logged. */
type Rule = {
  method: string;
  path: string;
  permission: Permission | Permission[];
  owner?: Owner;
  audit?: string;
  action?: AuditAction; // when the method alone says it wrong, e.g. signing a note is an update
};

const byId: Owner = (p) => p.id;
const byQuery: Owner = (_, u) => u.searchParams.get("patientId") ?? undefined;
const via =
  (rows: () => { id: string; patientId: string }[]): Owner =>
  (p) =>
    rows().find((r) => r.id === p.id)?.patientId;

/**
 * Every API route and the permission it needs. A route missing here is refused (403), so a new
 * endpoint must be added (CONVENTIONS "Registering a new feature"). NestJS: one guard decorator each.
 */
const RULES: Rule[] = [
  // Reference data: not personal data, so not audited
  { method: "GET", path: "/clinic", permission: "clinic.view" },
  { method: "GET", path: "/clinic/logo", permission: "clinic.view" }, // parents too: the portal shows the clinic's logo
  { method: "GET", path: "/branches", permission: "clinic.view" }, // archived ones too: old receipts name their branch
  { method: "GET", path: "/staff", permission: "clinic.view" },
  { method: "GET", path: "/chairs", permission: "clinic.view" },
  { method: "GET", path: "/procedures", permission: "clinic.view" },
  { method: "GET", path: "/note-templates", permission: "clinic.view" },
  // Owner settings (decision #11): the account, its branding, branches and staff logins
  { method: "GET", path: "/clinic/usage", permission: "clinic.manage" },
  { method: "GET", path: "/clinic/subscription", permission: "clinic.manage" }, // billing #31: the Owner's alone
  // Privacy #19, #22: the clinic's notice (public anyway, so reading it isn't audited) and the Owner's new version
  { method: "GET", path: "/clinic/privacy-notice", permission: "clinic.view" },
  { method: "PUT", path: "/clinic/privacy-notice", permission: "clinic.manage", audit: "Privacy notice", action: "update" },
  { method: "PUT", path: "/clinic", permission: "clinic.manage" },
  { method: "PUT", path: "/clinic/branding", permission: "clinic.manage" },
  { method: "PUT", path: "/clinic/logo", permission: "clinic.manage" },
  { method: "DELETE", path: "/clinic/logo", permission: "clinic.manage" },
  { method: "POST", path: "/branches", permission: "clinic.manage" },
  { method: "PUT", path: "/branches/:id", permission: "clinic.manage" },
  { method: "POST", path: "/branches/:id/archive", permission: "clinic.manage" },
  { method: "POST", path: "/branches/:id/reopen", permission: "clinic.manage" },
  { method: "POST", path: "/staff", permission: "clinic.manage", audit: "Staff login" },
  { method: "POST", path: "/staff/:id/deactivate", permission: "clinic.manage", audit: "Staff login (deactivated)", action: "update" },
  { method: "POST", path: "/staff/:id/reactivate", permission: "clinic.manage", audit: "Staff login (reactivated)", action: "update" },
  // Patients
  { method: "GET", path: "/patients", permission: "patients.view", owner: "filtered", audit: "Patient list" },
  { method: "GET", path: "/patient-summaries", permission: "patients.view", owner: "filtered", audit: "Patient list" },
  { method: "POST", path: "/patients", permission: "patients.write", audit: "Patient profile" },
  { method: "GET", path: "/patients/:id", permission: "patients.view", owner: byId, audit: "Patient profile" },
  { method: "PUT", path: "/patients/:id", permission: "patients.write", audit: "Patient profile" },
  { method: "POST", path: "/patients/:id/consents", permission: "patients.write", audit: "Consent" },
  // Privacy #12–#17: the required consent once (a child registered before chunk 24), the optional ones any time
  { method: "POST", path: "/patients/:id/privacy-consent", permission: "patients.write", audit: "Privacy consent" },
  { method: "POST", path: "/patients/:id/privacy-choices", permission: "consents.manage", owner: byId, audit: "Privacy consent (changed)", action: "update" },
  { method: "POST", path: "/patients/:id/exports", permission: "patients.view", owner: byId, audit: "Copy of records", action: "export" },
  { method: "PATCH", path: "/patients/:id", permission: "patients.write", audit: "Patient profile" },
  // Same record name as GET /patients/:id: the 5-minute repeat window folds the header's summary into the profile view.
  { method: "GET", path: "/patients/:id/summary", permission: "patients.view", owner: byId, audit: "Patient profile" },
  { method: "GET", path: "/patient-duplicates", permission: "patients.write", audit: "Patient list" },
  { method: "PUT", path: "/patients/:id/photo", permission: "patients.write", audit: "Patient photo", action: "update" },
  { method: "GET", path: "/patients/:id/photo", permission: "patients.view", owner: byId, audit: "Patient photo" },
  // AuditAction has no "delete": removing the photo changes the profile.
  { method: "DELETE", path: "/patients/:id/photo", permission: "patients.write", audit: "Patient photo", action: "update" },
  // Clinical records
  { method: "GET", path: "/patients/:id/visits", permission: "clinical.view", audit: "Visits" },
  { method: "POST", path: "/patients/:id/visits", permission: "clinical.write", audit: "Visit" },
  { method: "POST", path: "/visits/:id/complete", permission: "clinical.write", owner: via(() => db.visits), audit: "Visit (completed)", action: "update" },
  { method: "GET", path: "/patients/:id/chart", permission: "clinical.view", audit: "Dental chart" },
  { method: "POST", path: "/patients/:id/chart", permission: "clinical.write", audit: "Dental chart", action: "update" },
  { method: "POST", path: "/patients/:id/chart/batch", permission: "clinical.write", audit: "Dental chart", action: "update" },
  { method: "GET", path: "/patients/:id/notes", permission: "clinical.view", audit: "Clinical notes" },
  { method: "POST", path: "/patients/:id/notes", permission: "clinical.write", audit: "Clinical note" },
  { method: "PUT", path: "/notes/:id", permission: "clinical.write", owner: via(() => db.notes), audit: "Clinical note" },
  { method: "POST", path: "/notes/:id/sign", permission: "clinical.write", owner: via(() => db.notes), audit: "Clinical note (signed)", action: "update" },
  { method: "GET", path: "/patients/:id/growth", permission: "clinical.view", audit: "Growth and habits" },
  { method: "PUT", path: "/visits/:id/growth", permission: "clinical.write", owner: via(() => db.visits), audit: "Growth and habits" },
  // Photos: clinical photos for staff; a parent's own uploads (the handler narrows the list, Step 5.3)
  { method: "GET", path: "/patients/:id/photos", permission: ["clinical.view", "uploads.create"], owner: byId, audit: "Photos" },
  { method: "POST", path: "/patients/:id/photos", permission: ["clinical.write", "uploads.create"], owner: byId, audit: "Photo" },
  { method: "GET", path: "/photos/:id/file", permission: ["clinical.view", "uploads.create"], owner: via(() => db.photos), audit: "Photo" },
  // Treatment plan
  { method: "GET", path: "/patients/:id/plan", permission: "plan.view", owner: byId, audit: "Treatment plan" },
  { method: "POST", path: "/patients/:id/plan", permission: "plan.write", audit: "Treatment plan", action: "update" },
  { method: "PATCH", path: "/plan-items/:id", permission: "plan.write", owner: via(() => db.planItems), audit: "Treatment plan" },
  // Appointments
  { method: "GET", path: "/appointments", permission: "appointments.view", audit: "Appointment calendar" }, // the whole calendar: staff only
  { method: "GET", path: "/patients/:id/appointments", permission: "appointments.view", owner: byId, audit: "Appointments" },
  { method: "POST", path: "/appointments", permission: "appointments.manage", audit: "Appointment" },
  { method: "PUT", path: "/appointments/:id", permission: "appointments.manage", owner: via(() => db.appointments), audit: "Appointment" },
  {
    method: "POST",
    path: "/appointments/:id/status",
    permission: ["appointments.manage", "appointments.confirm"], // the handler limits confirm-only callers
    owner: via(() => db.appointments),
    audit: "Appointment status",
    action: "update",
  },
  { method: "GET", path: "/appointment-requests", permission: "appointments.manage", audit: "Appointment requests" },
  { method: "POST", path: "/appointment-requests/:id/handled", permission: "appointments.manage", owner: via(() => db.appointmentRequests), audit: "Appointment request", action: "update" },
  { method: "GET", path: "/patients/:id/appointment-requests", permission: ["appointments.manage", "appointments.request"], owner: byId, audit: "Appointment requests" },
  { method: "POST", path: "/patients/:id/appointment-requests", permission: "appointments.request", owner: byId, audit: "Appointment request" },
  // Recalls and messages
  { method: "GET", path: "/due-items", permission: "recalls.manage", audit: "Recall list" },
  { method: "POST", path: "/due-items/:id/message", permission: "messages.manage", owner: via(() => db.dueItems), audit: "Recall message" },
  { method: "POST", path: "/patients/:id/birthday-greeting", permission: "messages.manage", audit: "Birthday greeting" },
  { method: "GET", path: "/message-templates", permission: ["messages.manage", "documents.issue"] }, // documents print post-op text
  { method: "PUT", path: "/message-templates/:kind", permission: "messages.manage" },
  { method: "GET", path: "/messages", permission: "messages.view", owner: byQuery, audit: "Messages" },
  // Billing
  { method: "GET", path: "/patients/:id/invoices", permission: "billing.view", owner: byId, audit: "Invoices" },
  { method: "POST", path: "/patients/:id/invoices", permission: "billing.collect", audit: "Invoice" },
  { method: "GET", path: "/patients/:id/payments", permission: "billing.view", owner: byId, audit: "Payments" },
  { method: "GET", path: "/payments", permission: "billing.collect", audit: "Daily collections" },
  { method: "POST", path: "/invoices/:id/payments", permission: "billing.collect", owner: via(() => db.invoices), audit: "Payment" },
  { method: "POST", path: "/patients/:id/deposits", permission: "billing.collect", audit: "Deposit" },
  { method: "POST", path: "/invoices/:id/apply-credit", permission: "billing.collect", owner: via(() => db.invoices), audit: "Deposit applied" },
  // Documents and reports
  { method: "GET", path: "/documents", permission: "documents.issue", audit: "Documents log" },
  { method: "GET", path: "/patients/:id/documents", permission: "documents.issue", audit: "Documents" },
  { method: "POST", path: "/patients/:id/documents", permission: "documents.issue", audit: "Document", action: "export" },
  { method: "GET", path: "/reports/finance", permission: "dashboard.view", audit: "Financial report" },
  { method: "GET", path: "/reports/today", permission: "today.view", audit: "Today's schedule" }, // names, times, birthdays: personal data
  { method: "GET", path: "/audit-log", permission: "audit.view", audit: "Audit log" },
];

/** For the separation test (mocks/operator.test.ts): every clinic route, which an operator token must never pass. */
export const ACCESS_RULES: readonly Pick<Rule, "method" | "path">[] = RULES;

/**
 * Every operator route. One question only, "is this a Primolar operator?": the operator holds no clinic Permission
 * and no role (decision #25). Deny by default, as RULES: a route missing here is refused with its name.
 */
const OPERATOR_RULES: Pick<Rule, "method" | "path">[] = [
  { method: "GET", path: "/operator/accounts" },
  { method: "POST", path: "/operator/accounts" },
  { method: "PUT", path: "/operator/accounts/:id/tier" },
  { method: "POST", path: "/operator/accounts/:id/suspend" },
  { method: "POST", path: "/operator/accounts/:id/reactivate" },
  { method: "GET", path: "/operator/accounts/:id/staff" },
  { method: "POST", path: "/operator/accounts/:id/owner" },
  { method: "PUT", path: "/operator/accounts/:id/branding" },
  { method: "GET", path: "/operator/accounts/:id/subscription" },
  { method: "POST", path: "/operator/accounts/:id/subscription/payments" },
  { method: "POST", path: "/operator/accounts/:id/subscription/cancel" },
  { method: "GET", path: "/operator/signups" },
  { method: "GET", path: "/operator/signups/:id/files/:key" },
  { method: "PUT", path: "/operator/signups/:id" },
  { method: "POST", path: "/operator/signups/:id/payment" },
  { method: "POST", path: "/operator/signups/:id/reject" },
  { method: "POST", path: "/operator/signups/:id/approve" },
  { method: "GET", path: "/operator/prices" },
  { method: "PUT", path: "/operator/prices" },
];

/**
 * The public sign-up (billing #4): no session of any kind. Deny by default, as RULES. Branches off before sessionOf,
 * so a sign-up never selects a tenant, and a clinic or operator token changes nothing here.
 */
const PUBLIC_RULES: Pick<Rule, "method" | "path">[] = [
  { method: "GET", path: "/signups/prices" },
  { method: "POST", path: "/signups" },
  { method: "GET", path: "/signups/:reference" },
  { method: "GET", path: "/legal/notices/:clinicId" }, // privacy #3: each clinic's notice, before sign-in
];

function publicRefusal(request: Request, path: string) {
  return PUBLIC_RULES.some((r) => r.method === request.method && matchPath(r.path, path)) ? undefined : deny(403, `No access rule for ${request.method} ${path}`);
}

/** The gate for /operator/*: 401 without an operator token (a clinic token is not one), 403 for an unlisted route. */
function operatorRefusal(request: Request, path: string) {
  if (path.startsWith("/operator/auth/")) return; // sign-in, me and sign-out check the operator themselves
  if (!operatorOf(request)) return deny(401, "Sign in to the Primolar console to continue");
  return OPERATOR_RULES.some((r) => r.method === request.method && matchPath(r.path, path)) ? undefined : deny(403, `No access rule for ${request.method} ${path}`);
}

/** `/patients/:id/plan` against `/patients/abc/plan` → `{ id: "abc" }`. Segment for segment, no wildcards. */
export function matchPath(pattern: string, path: string): Record<string, string> | undefined {
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, segment] of want.entries()) {
    if (segment.startsWith(":")) params[segment.slice(1)] = decodeURIComponent(got[i]);
    else if (segment !== got[i]) return undefined;
  }
  return params;
}

const ACTION_OF: Record<string, AuditAction> = { GET: "view", POST: "create", PUT: "update", PATCH: "update" };
const REPEAT_WINDOW_MS = 5 * 60_000;
const MAX_EVENTS = 1000; // prototype only: localStorage is small. The real API keeps every entry.

/**
 * Appends one entry to the audit trail. Looking at the same record again within five minutes (a refetch,
 * a tab switch) isn't logged twice; changes always are. NestJS: an interceptor writing to an
 * insert-only table.
 */
export function recordAudit(actor: DemoAccountRecord, action: AuditAction, record: string, patientId?: string) {
  const now = new Date();
  const repeat =
    action === "view" &&
    db.auditEvents.some(
      (e) =>
        e.actorId === actor.id && e.action === action && e.record === record && e.patientId === patientId &&
        now.getTime() - Date.parse(e.at) < REPEAT_WINDOW_MS,
    );
  if (repeat) return;
  db.auditEvents.push({
    id: crypto.randomUUID(),
    clinicId: currentClinicId(),
    at: now.toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    record,
    patientId,
  });
  if (db.auditEvents.length > MAX_EVENTS) db.auditEvents.splice(0, db.auditEvents.length - MAX_EVENTS);
  persist();
}

/** The patient a request is about, when the path or the record says. */
function patientOf(rule: Rule, params: Record<string, string>, u: URL): string | undefined {
  if (rule.path.startsWith("/patients/:id")) return params.id;
  return typeof rule.owner === "function" ? rule.owner(params, u) : undefined;
}

/** 403 when this caller may not make this request, otherwise nothing. */
function refusal(session: MockSession, rule: Rule, params: Record<string, string>, u: URL) {
  const scopes = [rule.permission].flat().map((p) => permissionScopeFor(session.roles, p));
  if (scopes.includes("all")) return;
  if (!scopes.includes("own") || !rule.owner) return deny(403, "You don't have access to this");
  if (rule.owner === "filtered") return;
  const patientId = rule.owner(params, u);
  if (!patientId || !session.patientIds.has(patientId)) {
    return deny(403, "This isn't one of your children's records");
  }
}

/**
 * Registered before every feature handler. Answers 401 / 403, or returns nothing so MSW falls through
 * to the feature handler. Stands in for NestJS's auth guard plus a permission decorator per route.
 * Every audited request is logged here, refused ones as "denied". An allowed write is logged even if
 * the handler then rejects its input; NestJS logs after the response instead.
 */
export const accessGate = http.all(url("/*"), ({ request }) => {
  // S2: due dates are checked lazily, here, before anything reads an account's status or tier.
  settleSubscriptions();
  const u = new URL(request.url);
  const path = u.pathname.slice(new URL(env.apiUrl, u.origin).pathname.length);
  // The operator is not a clinic user (decision #25). Its requests branch off here, before sessionOf, so they never
  // select a tenant: `db` is never pointed anywhere for them and no clinic rule can match them.
  if (path.startsWith("/operator/")) return operatorRefusal(request, path);
  if (path === "/signups" || path.startsWith("/signups/") || path.startsWith("/legal/")) return publicRefusal(request, path);
  if (path.startsWith("/auth/")) return; // login, me and logout check the session themselves

  const session = sessionOf(request);
  if (!session) return deny(401, "Sign in to continue");
  // A login the Owner just made works only after its person picks their own password (decision #21). /auth/* is
  // outside this gate, so POST /auth/password still answers.
  if (session.mustChangePassword) return deny(403, "Choose your own password to continue");
  // Privacy #9, #21 (P7, P8): the Owner's updated terms, then a login's confidentiality acknowledgement. A parent's
  // notice is the portal's own step (P9). /auth/* is outside this gate, so /auth/acknowledgement still answers.
  if (session.mustAcknowledge === "terms") return deny(403, "Accept Primolar's updated terms to continue");
  if (session.mustAcknowledge === "confidentiality") return deny(403, "Acknowledge patient confidentiality to continue");

  const hit = RULES.filter((r) => r.method === request.method)
    .map((rule) => ({ rule, params: matchPath(rule.path, path) }))
    .find((h) => h.params);
  if (!hit?.params) return deny(403, `No access rule for ${request.method} ${path}`);

  // A suspended clinic's parents may look, not change (decision #44). A copy of records (action "export") is a read.
  if (session.readOnly && request.method !== "GET" && hit.rule.action !== "export") {
    recordAudit(session, "denied", hit.rule.audit ?? "Portal (clinic paused)", patientOf(hit.rule, hit.params, u));
    return deny(403, "Your clinic's account is paused, so you can view records but not make changes. Contact your clinic.");
  }

  const refused = refusal(session, hit.rule, hit.params, u);
  const { audit, action = ACTION_OF[request.method] } = hit.rule;
  if (audit) recordAudit(session, refused ? "denied" : action, audit, patientOf(hit.rule, hit.params, u));
  return refused;
});
