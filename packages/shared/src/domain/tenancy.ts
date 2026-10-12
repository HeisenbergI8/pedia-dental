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

/**
 * Does this staff member work at the branch? Their assignment, or every branch for the Owner (`branches.all`).
 * Never a deactivated login (decision #23).
 */
export const worksAt = (staff: Pick<StaffMember, "role" | "alsoRoles" | "isOwner" | "branchIds" | "deactivatedAt">, branch: Branch) =>
  isActiveStaff(staff) && usableBranches(rolesOf(staff), staff.branchIds, [branch]).length > 0;

/** What the operator and the Owner call each tier. */
export const TIER_LABEL: Record<Tier, string> = { small: "Small", mid: "Mid", big: "Big" };

/** Can sign in and be chosen for new work. A deactivated login keeps its name on what it recorded (decision #23). */
export const isActiveStaff = (staff: Pick<StaffMember, "deactivatedAt">) => !staff.deactivatedAt;

/** What counts toward the limits: open branches and active logins, the Owner included (decisions #10, #37). */
export function accountUsage(data: { branches: Pick<Branch, "archived">[]; staff: Pick<StaffMember, "deactivatedAt">[] }) {
  return { branches: data.branches.filter((b) => !b.archived).length, staffLogins: data.staff.filter(isActiveStaff).length };
}

const LIMIT_NOUN = { branches: ["branch", "branches"], staffLogins: ["staff login", "staff logins"] } as const;

/** The refusal at a limit (decision #8), word for word the same in the form and the API. */
export function limitMessage(tier: Tier, limit: "branches" | "staffLogins"): string {
  const max = TIER_LIMITS[tier][limit];
  const [one, many] = LIMIT_NOUN[limit];
  return `Your ${TIER_LABEL[tier]} plan includes ${max ?? "unlimited"} ${max === 1 ? one : many}. Contact Primolar to upgrade.`;
}

/** "12 Aguinaldo Highway, Imus · (046) 417 0001": under the clinic's name on receipts and letterheads (decision #19). */
export const branchLine = (branch: Pick<Branch, "address" | "phone">) => `${branch.address} · ${branch.phone}`;

/**
 * Why this branch can't be archived now, in plain words. Undefined when it can (decision #22). It must not be the last
 * open one (an account always has a branch to work at), nobody may be left with no branch, and nothing may still be
 * booked there. `upcoming` is the count of its future bookings, which the caller has the dates to work out.
 */
export function archiveProblem(
  branch: Pick<Branch, "id" | "name">,
  data: { branches: Pick<Branch, "id" | "archived">[]; staff: Pick<StaffMember, "fullName" | "isOwner" | "branchIds" | "deactivatedAt">[]; upcoming: number },
): string | undefined {
  const stillOpen = data.branches.filter((b) => !b.archived && b.id !== branch.id).map((b) => b.id);
  if (stillOpen.length === 0) return "A clinic always keeps one open branch. Add another branch before archiving this one.";
  const stranded = data.staff.filter((s) => isActiveStaff(s) && !s.isOwner && !s.branchIds.some((id) => stillOpen.includes(id)));
  if (stranded.length) {
    const who = stranded.map((s) => s.fullName).join(", ");
    return `${who} ${stranded.length === 1 ? "works" : "work"} only at ${branch.name}. Deactivate ${stranded.length === 1 ? "them" : "those logins"} first.`;
  }
  if (data.upcoming > 0) {
    return `${branch.name} has ${data.upcoming} upcoming appointment${data.upcoming === 1 ? "" : "s"}. Move or cancel ${data.upcoming === 1 ? "it" : "them"} first.`;
  }
  return undefined;
}

/** Typed digits → "123-456-789" or "123-456-789-0001" (decision #42). Extra digits beyond a 5-digit branch code drop. */
export function formatTin(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join("-");
}
