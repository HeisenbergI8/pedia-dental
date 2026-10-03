import type { Role } from "../schemas/common";
import { Permission, type PermissionScope } from "../schemas/auth";

type Grants = Partial<Record<Permission, PermissionScope>>;
const grant = (scope: PermissionScope, ...permissions: Permission[]) =>
  Object.fromEntries(permissions.map((p) => [p, scope])) as Grants;

/** Actions only a parent takes for their own child. Staff do the same work from the staff screens. */
const PARENT_ONLY: readonly Permission[] = ["appointments.request", "uploads.create"];

/**
 * Who may do what: the single source of truth, read by the web app (nav, route gate, `<Can>`) and by
 * the API (the mock access gate now, NestJS guards later). Data, not `if` statements.
 * The matrix and the reasoning behind it: .claude/plans/login-rbac-portal (Q1).
 */
export const ROLE_PERMISSIONS: Record<Role, Grants> = {
  admin: grant("all", ...Permission.options.filter((p) => !PARENT_ONLY.includes(p))),
  dentist: grant(
    "all",
    "patients.view",
    "patients.write",
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
  ),
  // Reads every clinical record (allergies, chart, plan) but doesn't write them.
  front_desk: grant(
    "all",
    "patients.view",
    "patients.write",
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
  ),
  // Only their own children. Clinic reference data (dentist names, procedure names) is not patient data.
  parent: {
    ...grant(
      "own",
      "patients.view",
      "appointments.view",
      "appointments.confirm",
      "appointments.request",
      "plan.view",
      "billing.view",
      "messages.view",
      "uploads.create",
    ),
    ...grant("all", "clinic.view"),
  },
};

export const STAFF_ROLES = ["admin", "dentist", "front_desk"] as const satisfies readonly Role[];
export const isStaffRole = (role: Role) => role !== "parent";

export function permissionScope(role: Role, permission: Permission): PermissionScope | undefined {
  return ROLE_PERMISSIONS[role][permission];
}

/** True when the role holds the permission at any scope, or only at `all` when that is asked for. */
export function roleCan(role: Role, permission: Permission, scope?: "all"): boolean {
  const held = permissionScope(role, permission);
  return scope ? held === scope : held !== undefined;
}
