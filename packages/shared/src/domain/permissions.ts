import type { Role } from "../schemas/common";
import { Permission, type PermissionScope } from "../schemas/auth";

type Grants = Partial<Record<Permission, PermissionScope>>;
const grant = (scope: PermissionScope, ...permissions: Permission[]) =>
  Object.fromEntries(permissions.map((p) => [p, scope])) as Grants;

/** Actions only a parent takes for their own child. Staff do the same work from the staff screens. */
const PARENT_ONLY: readonly Permission[] = ["appointments.request", "uploads.create"];
/** The account-wide powers only the Owner holds. */
export const OWNER_ONLY: readonly Permission[] = ["branches.all", "clinic.manage"];
const STAFF_PERMISSIONS = Permission.options.filter((p) => !PARENT_ONLY.includes(p));
/** What a read-only session (a parent of a suspended clinic, decision #44) can't do: the portal's write actions (#46). */
export const READ_ONLY_DENIED: readonly Permission[] = ["appointments.confirm", "appointments.request", "uploads.create", "consents.manage"];

/**
 * Who may do what: the single source of truth, read by the web app (nav, route gate, `<Can>`) and by
 * the API (the mock access gate now, NestJS guards later). Data, not `if` statements.
 * The matrix and the reasoning behind it: .claude/plans/login-rbac-portal (Q1).
 */
export const ROLE_PERMISSIONS: Record<Role, Grants> = {
  owner: grant("all", ...STAFF_PERMISSIONS),
  // Runs their assigned branches as today (decision #11): everything but the Owner's account-wide powers.
  admin: grant("all", ...STAFF_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p))),
  dentist: grant(
    "all",
    "today.view",
    "patients.view",
    "patients.write",
    "consents.manage",
    "appointments.view",
    "appointments.manage",
    "appointments.confirm",
    "clinical.view",
    "clinical.write",
    "plan.view",
    "plan.write",
    "billing.view",
    "documents.issue",
    "clinic.view",
    "settings.view",
    "session.switch",
  ),
  // Reads every clinical record (allergies, chart, plan) but doesn't write them.
  front_desk: grant(
    "all",
    "today.view",
    "patients.view",
    "patients.write",
    "consents.manage",
    "patients.contact", // calls parents, books, chases balances
    "appointments.view",
    "appointments.manage",
    "appointments.confirm",
    "clinical.view",
    "plan.view",
    "billing.view",
    "billing.collect",
    "recalls.manage",
    "messages.view",
    "messages.manage",
    "documents.issue",
    "clinic.view",
    "settings.view",
    "session.switch",
    "portal.manage", // B11 decision 16: they edit a family's contact details
  ),
  // Only their own children. Clinic reference data (dentist names, procedure names) is not patient data.
  parent: {
    ...grant(
      "own",
      "patients.view",
      "patients.contact", // their own family's phones, email and address (their own data)
      "appointments.view",
      "appointments.confirm",
      "appointments.request",
      "plan.view",
      "billing.view",
      "messages.view",
      "uploads.create",
      "consents.manage",
    ),
    ...grant("all", "clinic.view"),
  },
};

export const STAFF_ROLES = ["owner", "admin", "dentist", "front_desk"] as const satisfies readonly Role[];
export const isStaffRole = (role: Role) => role !== "parent";

export function permissionScope(role: Role, permission: Permission): PermissionScope | undefined {
  return ROLE_PERMISSIONS[role][permission];
}

/** True when the role holds the permission at any scope, or only at `all` when that is asked for. */
export function roleCan(role: Role, permission: Permission, scope?: "all"): boolean {
  const held = permissionScope(role, permission);
  return scope ? held === scope : held !== undefined;
}

/** Several roles held at once (decision #39): the widest scope any of them grants. `all` beats `own`. */
export function permissionScopeFor(roles: readonly Role[], permission: Permission): PermissionScope | undefined {
  const scopes = roles.map((r) => permissionScope(r, permission));
  return scopes.includes("all") ? "all" : scopes.includes("own") ? "own" : undefined;
}

/** `roleCan` for everyone who holds more than one role. Every access check on a session uses this. */
export function rolesCan(roles: readonly Role[], permission: Permission, scope?: "all"): boolean {
  const held = permissionScopeFor(roles, permission);
  return scope ? held === scope : held !== undefined;
}
