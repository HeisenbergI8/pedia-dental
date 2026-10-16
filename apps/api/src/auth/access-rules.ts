import { rolesCan, type Permission, type Role } from "@pedia/shared";

/** Which patient a request is about, for own-scope (parent) callers. `record`: looked up from the row (B11). */
export type Owner = "filtered" | "id" | "query" | "record";
export type Route = { method: string; path: string };
/** `exportRead`: a copy of records is a read, so a read-only session (decision #44) may still ask for it. */
export type ClinicRule = Route & { permission: Permission | Permission[]; owner?: Owner; exportRead?: true };

/**
 * Every clinic route and the permission it needs: RULES in apps/web/src/mocks/access.ts, which access-rules.test.ts
 * reads to keep the two equal. A controller route missing from every list here answers 403 naming the route.
 */
export const CLINIC_RULES: readonly ClinicRule[] = [
  { method: "GET", path: "/clinic", permission: "clinic.view" },
  { method: "GET", path: "/clinic/logo", permission: "clinic.view" },
  { method: "GET", path: "/branches", permission: "clinic.view" },
  { method: "GET", path: "/staff", permission: "clinic.view" },
  { method: "GET", path: "/chairs", permission: "clinic.view" },
  { method: "GET", path: "/procedures", permission: "clinic.view" },
  { method: "GET", path: "/note-templates", permission: "clinic.view" },
  { method: "GET", path: "/clinic/usage", permission: "clinic.manage" },
  { method: "GET", path: "/clinic/subscription", permission: "clinic.manage" },
  { method: "GET", path: "/clinic/privacy-notice", permission: "clinic.view" },
  { method: "PUT", path: "/clinic/privacy-notice", permission: "clinic.manage" },
  { method: "PUT", path: "/clinic", permission: "clinic.manage" },
  { method: "PUT", path: "/clinic/branding", permission: "clinic.manage" },
  { method: "PUT", path: "/clinic/logo", permission: "clinic.manage" },
  { method: "DELETE", path: "/clinic/logo", permission: "clinic.manage" },
  { method: "POST", path: "/branches", permission: "clinic.manage" },
  { method: "PUT", path: "/branches/:id", permission: "clinic.manage" },
  { method: "POST", path: "/branches/:id/archive", permission: "clinic.manage" },
  { method: "POST", path: "/branches/:id/reopen", permission: "clinic.manage" },
  { method: "POST", path: "/staff", permission: "clinic.manage" },
  { method: "POST", path: "/staff/:id/deactivate", permission: "clinic.manage" },
  { method: "POST", path: "/staff/:id/reactivate", permission: "clinic.manage" },
  { method: "GET", path: "/patients", permission: "patients.view", owner: "filtered" },
  { method: "GET", path: "/patient-summaries", permission: "patients.view", owner: "filtered" },
  { method: "POST", path: "/patients", permission: "patients.write" },
  { method: "GET", path: "/patients/:id", permission: "patients.view", owner: "id" },
  { method: "PUT", path: "/patients/:id", permission: "patients.write" },
  { method: "POST", path: "/patients/:id/consents", permission: "patients.write" },
  { method: "POST", path: "/patients/:id/privacy-consent", permission: "patients.write" },
  { method: "POST", path: "/patients/:id/privacy-choices", permission: "consents.manage", owner: "id" },
  { method: "POST", path: "/patients/:id/exports", permission: "patients.view", owner: "id", exportRead: true },
  { method: "PATCH", path: "/patients/:id", permission: "patients.write" },
  { method: "GET", path: "/patients/:id/summary", permission: "patients.view", owner: "id" },
  { method: "GET", path: "/patient-duplicates", permission: "patients.write" },
  { method: "PUT", path: "/patients/:id/photo", permission: "patients.write" },
  { method: "GET", path: "/patients/:id/photo", permission: "patients.view", owner: "id" },
  { method: "DELETE", path: "/patients/:id/photo", permission: "patients.write" },
  { method: "GET", path: "/patients/:id/visits", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/visits", permission: "clinical.write" },
  { method: "POST", path: "/visits/:id/complete", permission: "clinical.write", owner: "record" },
  { method: "GET", path: "/patients/:id/chart", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/chart", permission: "clinical.write" },
  { method: "POST", path: "/patients/:id/chart/batch", permission: "clinical.write" },
  { method: "GET", path: "/patients/:id/notes", permission: "clinical.view" },
  { method: "POST", path: "/patients/:id/notes", permission: "clinical.write" },
  { method: "PUT", path: "/notes/:id", permission: "clinical.write", owner: "record" },
  { method: "POST", path: "/notes/:id/sign", permission: "clinical.write", owner: "record" },
  { method: "GET", path: "/patients/:id/growth", permission: "clinical.view" },
  { method: "PUT", path: "/visits/:id/growth", permission: "clinical.write", owner: "record" },
  { method: "GET", path: "/patients/:id/photos", permission: ["clinical.view", "uploads.create"], owner: "id" },
  { method: "POST", path: "/patients/:id/photos", permission: ["clinical.write", "uploads.create"], owner: "id" },
  { method: "GET", path: "/photos/:id/file", permission: ["clinical.view", "uploads.create"], owner: "record" },
  { method: "GET", path: "/patients/:id/plan", permission: "plan.view", owner: "id" },
  { method: "POST", path: "/patients/:id/plan", permission: "plan.write" },
  { method: "PATCH", path: "/plan-items/:id", permission: "plan.write", owner: "record" },
  { method: "GET", path: "/appointments", permission: "appointments.view" },
  { method: "GET", path: "/patients/:id/appointments", permission: "appointments.view", owner: "id" },
  { method: "POST", path: "/appointments", permission: "appointments.manage" },
  { method: "PUT", path: "/appointments/:id", permission: "appointments.manage", owner: "record" },
  { method: "POST", path: "/appointments/:id/status", permission: ["appointments.manage", "appointments.confirm"], owner: "record" },
  { method: "GET", path: "/appointment-requests", permission: "appointments.manage" },
  { method: "POST", path: "/appointment-requests/:id/handled", permission: "appointments.manage", owner: "record" },
  { method: "GET", path: "/patients/:id/appointment-requests", permission: ["appointments.manage", "appointments.request"], owner: "id" },
  { method: "POST", path: "/patients/:id/appointment-requests", permission: "appointments.request", owner: "id" },
  { method: "GET", path: "/due-items", permission: "recalls.manage" },
  { method: "POST", path: "/due-items/:id/message", permission: "messages.manage", owner: "record" },
  { method: "POST", path: "/patients/:id/birthday-greeting", permission: "messages.manage" },
  { method: "GET", path: "/message-templates", permission: ["messages.manage", "documents.issue"] },
  { method: "PUT", path: "/message-templates/:kind", permission: "messages.manage" },
  { method: "GET", path: "/messages", permission: "messages.view", owner: "query" },
  { method: "GET", path: "/patients/:id/invoices", permission: "billing.view", owner: "id" },
  { method: "POST", path: "/patients/:id/invoices", permission: "billing.collect" },
  { method: "GET", path: "/patients/:id/payments", permission: "billing.view", owner: "id" },
  { method: "GET", path: "/payments", permission: "billing.collect" },
  { method: "POST", path: "/invoices/:id/payments", permission: "billing.collect", owner: "record" },
  { method: "POST", path: "/patients/:id/deposits", permission: "billing.collect" },
  { method: "POST", path: "/invoices/:id/apply-credit", permission: "billing.collect", owner: "record" },
  { method: "GET", path: "/documents", permission: "documents.issue" },
  { method: "GET", path: "/patients/:id/documents", permission: "documents.issue" },
  { method: "POST", path: "/patients/:id/documents", permission: "documents.issue", exportRead: true },
  { method: "GET", path: "/reports/finance", permission: "dashboard.view" },
  { method: "GET", path: "/reports/today", permission: "today.view" },
  { method: "GET", path: "/audit-log", permission: "audit.view" },
];

/** OPERATOR_RULES in the mock: one question only, "is this a Primolar operator?" (decision #25). */
export const OPERATOR_RULES: readonly Route[] = [
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

/** PUBLIC_RULES in the mock (no session of any kind), plus the API's own health check. */
export const PUBLIC_RULES: readonly Route[] = [
  { method: "GET", path: "/signups/prices" },
  { method: "POST", path: "/signups" },
  { method: "GET", path: "/signups/:reference" },
  { method: "GET", path: "/legal/notices/:clinicId" },
  { method: "GET", path: "/health" },
];

/**
 * Sign-in, me, sign-out and the gates' own escape hatches. The mock lets all of /auth/* through and the handler
 * checks the session itself. Here they are listed, so deny by default holds for them too. The guard still loads a
 * session when one is presented (the handler reads it from the request context), but requires none.
 */
export const SELF_CHECKED_RULES: readonly Route[] = [
  { method: "GET", path: "/auth/demo-accounts" },
  { method: "POST", path: "/auth/login" },
  { method: "GET", path: "/auth/me" },
  { method: "POST", path: "/auth/logout" },
  { method: "POST", path: "/auth/switch" },
  { method: "POST", path: "/auth/password" },
  { method: "GET", path: "/auth/acknowledgement" },
  { method: "POST", path: "/auth/acknowledgement" },
  { method: "POST", path: "/operator/auth/login" },
  { method: "GET", path: "/operator/auth/me" },
  { method: "POST", path: "/operator/auth/logout" },
];

/** `/patients/:id/plan` against `/patients/abc/plan` → `{ id: "abc" }`. Segment for segment, no wildcards (the mock's `match`). */
export function matchPath(pattern: string, path: string): Record<string, string> | undefined {
  const want = pattern.split("/");
  const got = path.split("/");
  if (want.length !== got.length) return undefined;
  const params: Record<string, string> = {};
  for (const [i, segment] of want.entries()) {
    if (segment.startsWith(":")) {
      try {
        params[segment.slice(1)] = decodeURIComponent(got[i]!);
      } catch {
        return undefined;
      }
    } else if (segment !== got[i]) return undefined;
  }
  return params;
}

export type Match =
  | { kind: "clinic"; rule: ClinicRule; params: Record<string, string> }
  | { kind: "operator" | "public" | "self"; params: Record<string, string> };

const find = <R extends Route>(rules: readonly R[], method: string, path: string) =>
  rules.filter((r) => r.method === method).map((rule) => ({ rule, params: matchPath(rule.path, path) })).find((h) => h.params);

/** The rule for a request, or undefined: no rule, so 403 naming the route (deny by default). */
export function matchRoute(method: string, path: string): Match | undefined {
  const self = find(SELF_CHECKED_RULES, method, path);
  if (self) return { kind: "self", params: self.params! };
  if (path.startsWith("/operator/")) {
    const hit = find(OPERATOR_RULES, method, path);
    return hit && { kind: "operator", params: hit.params! };
  }
  const open = find(PUBLIC_RULES, method, path);
  if (open) return { kind: "public", params: open.params! };
  const hit = find(CLINIC_RULES, method, path);
  return hit && { kind: "clinic", rule: hit.rule, params: hit.params! };
}

/**
 * Why this caller may not make this request, or undefined when they may. The mock's `refusal`, decided only by
 * `rolesCan`: a permission held at `all` passes; one held only at `own` passes a `filtered` route (the service narrows
 * the list) or a route about one of `children`; anything else is refused.
 */
export function clinicRefusal(roles: readonly Role[], rule: ClinicRule, params: Record<string, string>, query: URLSearchParams, children: ReadonlySet<string>, recordPatient?: string): string | undefined {
  const permissions = [rule.permission].flat();
  if (permissions.some((p) => rolesCan(roles, p, "all"))) return undefined;
  if (!permissions.some((p) => rolesCan(roles, p)) || !rule.owner) return "You don't have access to this";
  if (rule.owner === "filtered") return undefined;
  const patientId = rule.owner === "id" ? params.id : rule.owner === "query" ? (query.get("patientId") ?? undefined) : recordPatient;
  return patientId && children.has(patientId) ? undefined : "This isn't one of your children's records";
}
