import { Role } from "../schemas/common";
import type { StaffMember } from "../schemas/clinic";
import type { Branch, OpeningHours, Tier } from "../schemas/tenancy";
import { rolesCan } from "./permissions";

/** `null` is unlimited. Archived branches and deactivated staff never count toward a limit (decision #10). */
export type TierLimits = { branches: number | null; staffLogins: number | null; crossBranchViews: boolean; headingFont: boolean };

/** Decisions #5–#7. Enforced in the handler and the UI by Owner settings; read here, never re-typed. */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  small: { branches: 1, staffLogins: 5, crossBranchViews: false, headingFont: false },
  mid: { branches: 3, staffLogins: 20, crossBranchViews: true, headingFont: false },
  big: { branches: null, staffLogins: null, crossBranchViews: true, headingFont: true },
};

/**
 * May one more be added? Only ever blocks the NEXT one: after a downgrade, what exists stays usable (decision #9),
 * so `inUse` above the limit is valid data, not an error.
 */
export function canAddUnder(tier: Tier, limit: "branches" | "staffLogins", inUse: number): boolean {
  const max = TIER_LIMITS[tier][limit];
  return max === null || inUse < max;
}

/** A new branch's hours until the Owner edits them: the demo clinic's hours before tenancy (Mon–Sat, 8 AM–6 PM). */
export const DEFAULT_OPENING_HOURS: OpeningHours = { opensAt: 8 * 60, closesAt: 18 * 60, closedWeekdays: [0] };

/** Every role a staff member signs in with, highest first: Owner if they own the account, their job, any second role. */
export function rolesOf(staff: Pick<StaffMember, "role" | "alsoRoles" | "isOwner">): Role[] {
  const held = new Set<Role>([...(staff.isOwner ? (["owner"] as const) : []), staff.role, ...(staff.alsoRoles ?? [])]);
  return Role.options.filter((r) => held.has(r));
}

/** Does this staff member hold the role, as their job or a second role? E.g. who can be booked as a dentist. */
export const holdsRole = (staff: Pick<StaffMember, "role" | "alsoRoles">, role: Role) =>
  staff.role === role || (staff.alsoRoles ?? []).includes(role as StaffMember["role"]);

/**
 * The open (not archived) branches someone may work at. `branches.all` (the Owner) means every one. Staff get their
 * assignments. `branchIds` undefined means not tied to a branch (a parent), which sees every branch's details.
 */
export function usableBranches(roles: readonly Role[], branchIds: readonly string[] | undefined, branches: Branch[]): Branch[] {
  const open = branches.filter((b) => !b.archived);
  if (rolesCan(roles, "branches.all") || !branchIds) return open;
  return open.filter((b) => branchIds.includes(b.id));
}

/** Does this staff member work at the branch? Their assignment, or every branch for the Owner (`branches.all`). */
export const worksAt = (staff: Pick<StaffMember, "role" | "alsoRoles" | "isOwner" | "branchIds">, branch: Branch) =>
  usableBranches(rolesOf(staff), staff.branchIds, [branch]).length > 0;
