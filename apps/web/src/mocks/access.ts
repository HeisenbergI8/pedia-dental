import { http, HttpResponse } from "msw";
import { permissionScope, type Permission } from "@pedia/shared";
import { env } from "@/lib/env";
import { db } from "./db";
import { accountForToken, childrenOf, type DemoAccountRecord } from "./demo-accounts";

const url = (p: string) => `${env.apiUrl}${p}`;
export const SESSION_COOKIE = "pd_session";

export type MockSession = DemoAccountRecord & { patientIds: Set<string> };

/** The bearer header (scripts) or the session cookie (the browser, including <img> requests). */
function tokenOf(request: Request): string | undefined {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) return bearer;
  // MSW runs handlers in the page, so the cookie the session store wrote is readable. Tests stub `document`.
  const cookies = typeof document === "undefined" ? "" : document.cookie;
  return cookies
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}

export function sessionOf(request: Request): MockSession | undefined {
  const account = accountForToken(db, tokenOf(request));
  if (!account) return undefined;
  const children = account.guardianId ? childrenOf(db, account.guardianId) : [];
  return { ...account, patientIds: new Set(children.map((p) => p.id)) };
}

/** For handlers the gate passed as "filtered": may this caller see this patient's row? */
export function inScope(session: MockSession | undefined, permission: Permission, patientId: string) {
  const scope = session && permissionScope(session.role, permission);
  return scope === "all" || (scope === "own" && session!.patientIds.has(patientId));
}

/** Which patient a request is about, for `own`-scoped callers. */
type Owner = ((params: Record<string, string>, url: URL) => string | undefined) | "filtered";
type Rule = { method: string; path: string; permission: Permission | Permission[]; owner?: Owner };

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
  // Reference data
  { method: "GET", path: "/staff", permission: "clinic.view" },
  { method: "GET", path: "/chairs", permission: "clinic.view" },
  { method: "GET", path: "/procedures", permission: "clinic.view" },
  { method: "GET", path: "/note-templates", permission: "clinic.view" },
  // Patients
  { method: "GET", path: "/patients", permission: "patients.view", owner: "filtered" },
  { method: "POST", path: "/patients", permission: "patients.write" },
  { method: "GET", path: "/patients/:id", permission: "patients.view", owner: byId },
  { method: "PUT", path: "/patients/:id", permission: "patients.write" },
  { method: "POST", path: "/patients/:id/consents", permission: "patients.write" },
  // Clinical records
  { method: "GET", path: "/patients/:id/visits", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/visits", permission: "clinical.write" },
  { method: "POST", path: "/visits/:id/complete", permission: "clinical.write" },
  { method: "GET", path: "/patients/:id/chart", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/chart", permission: "clinical.write" },
  { method: "GET", path: "/patients/:id/notes", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/notes", permission: "clinical.write" },
  { method: "PUT", path: "/notes/:id", permission: "clinical.write" },
  { method: "POST", path: "/notes/:id/sign", permission: "clinical.write" },
  { method: "GET", path: "/patients/:id/growth", permission: "clinical.view" },
  { method: "PUT", path: "/visits/:id/growth", permission: "clinical.write" },
  // Photos: clinical photos for staff; a parent's own uploads (the handler narrows the list, Step 5.3)
  { method: "GET", path: "/patients/:id/photos", permission: ["clinical.view", "uploads.create"], owner: byId },
  { method: "POST", path: "/patients/:id/photos", permission: ["clinical.write", "uploads.create"], owner: byId },
  { method: "GET", path: "/photos/:id/file", permission: ["clinical.view", "uploads.create"], owner: via(() => db.photos) },
  // Treatment plan
  { method: "GET", path: "/patients/:id/plan", permission: "plan.view", owner: byId },
  { method: "POST", path: "/patients/:id/plan", permission: "plan.write" },
  { method: "PATCH", path: "/plan-items/:id", permission: "plan.write" },
  // Appointments
  { method: "GET", path: "/appointments", permission: "appointments.view" }, // the whole calendar: staff only
  { method: "GET", path: "/patients/:id/appointments", permission: "appointments.view", owner: byId },
  { method: "POST", path: "/appointments", permission: "appointments.manage" },
  { method: "PUT", path: "/appointments/:id", permission: "appointments.manage" },
  {
    method: "POST",
    path: "/appointments/:id/status",
    permission: ["appointments.manage", "appointments.confirm"], // the handler limits confirm-only callers
    owner: via(() => db.appointments),
  },
  { method: "GET", path: "/appointment-requests", permission: "appointments.manage" },
  { method: "POST", path: "/appointment-requests/:id/handled", permission: "appointments.manage" },
  { method: "GET", path: "/patients/:id/appointment-requests", permission: ["appointments.manage", "appointments.request"], owner: byId },
  { method: "POST", path: "/patients/:id/appointment-requests", permission: "appointments.request", owner: byId },
  // Recalls and messages
  { method: "GET", path: "/due-items", permission: "recalls.manage" },
  { method: "POST", path: "/due-items/:id/message", permission: "messages.manage" },
  { method: "GET", path: "/message-templates", permission: ["messages.manage", "documents.issue"] }, // documents print post-op text
  { method: "PUT", path: "/message-templates/:kind", permission: "messages.manage" },
  { method: "GET", path: "/messages", permission: "messages.view", owner: byQuery },
  // Billing
  { method: "GET", path: "/patients/:id/invoices", permission: "billing.view", owner: byId },
  { method: "POST", path: "/patients/:id/invoices", permission: "billing.collect" },
  { method: "GET", path: "/patients/:id/payments", permission: "billing.view", owner: byId },
  { method: "GET", path: "/payments", permission: "billing.collect" },
  { method: "POST", path: "/invoices/:id/payments", permission: "billing.collect" },
  // Documents and reports
  { method: "GET", path: "/documents", permission: "documents.issue" },
  { method: "GET", path: "/patients/:id/documents", permission: "documents.issue" },
  { method: "POST", path: "/patients/:id/documents", permission: "documents.issue" },
  { method: "GET", path: "/reports/finance", permission: "dashboard.view" },
];

/** `/patients/:id/plan` against `/patients/abc/plan` → `{ id: "abc" }`. Segment for segment, no wildcards. */
function match(pattern: string, path: string): Record<string, string> | undefined {
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

const deny = (status: 401 | 403, message: string) => new HttpResponse(message, { status });

/**
 * Registered before every feature handler. Answers 401 / 403, or returns nothing so MSW falls through
 * to the feature handler. Stands in for NestJS's auth guard plus a permission decorator per route.
 */
export const accessGate = http.all(url("/*"), ({ request }) => {
  const u = new URL(request.url);
  const path = u.pathname.slice(new URL(env.apiUrl, u.origin).pathname.length);
  if (path.startsWith("/auth/")) return; // login, me and logout check the session themselves

  const session = sessionOf(request);
  if (!session) return deny(401, "Sign in to continue");

  const hit = RULES.filter((r) => r.method === request.method)
    .map((rule) => ({ rule, params: match(rule.path, path) }))
    .find((h) => h.params);
  if (!hit?.params) return deny(403, `No access rule for ${request.method} ${path}`);

  const scopes = [hit.rule.permission].flat().map((p) => permissionScope(session.role, p));
  if (scopes.includes("all")) return;
  if (!scopes.includes("own") || !hit.rule.owner) return deny(403, "You don't have access to this");
  if (hit.rule.owner === "filtered") return;
  const patientId = hit.rule.owner(hit.params, u);
  if (!patientId || !session.patientIds.has(patientId)) {
    return deny(403, "This isn't one of your children's records");
  }
});
