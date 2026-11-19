import { format, parseISO } from "date-fns";
import { Role } from "../schemas/common";
import type { StaffMember } from "../schemas/clinic";
import type { Branch, ClinicSupportView, OpeningHours, SupportContact, SupportSettings, Tier } from "../schemas/tenancy";
import { rolesCan } from "./permissions";

/**
 * `null` is unlimited. Archived branches and deactivated staff never count toward a limit (decision #10). The heading
 * font is on every plan since billing #8 (it was Big's), so it is no longer a limit.
 */
export type TierLimits = {
  branches: number | null;
  staffLogins: number | null;
  crossBranchViews: boolean;
  /** B12 decisions 1, 2: every plan has both. Storage in bytes; texts in billed SMS parts a Manila calendar month. */
  storageBytes: number;
  textParts: number;
  /** Feature 16 (revised 2026-11-19): parents may ask for an appointment in the portal. */
  appointmentRequests: boolean;
  /** D11: the clinic may customise its letterhead (text or an image). The standard header (logo, colour) is every tier's (D4). */
  customLetterhead: boolean;
  /** The financial dashboard's export (not built yet, D5). Never the clinic's own data export: that is NEVER_LIMITED. */
  financeExport: boolean;
  /** Design it for me costs nothing extra at sign-up. */
  designIncluded: boolean;
};
const GIB = 1024 ** 3;

/**
 * Decisions #5, #6, revised 2026-11-19 (ROADMAP feature 16). Enforced in the handler and the UI; read here, never
 * re-typed. Limits only ever rose in the revision, so no existing clinic is over a limit because of it.
 */
export const TIER_LIMITS: Record<Tier, TierLimits> = {
  small: {
    branches: 1, staffLogins: 10, crossBranchViews: false, storageBytes: 25 * GIB, textParts: 500,
    appointmentRequests: false, customLetterhead: false, financeExport: false, designIncluded: false,
  },
  mid: {
    branches: 3, staffLogins: 30, crossBranchViews: true, storageBytes: 100 * GIB, textParts: 1500,
    appointmentRequests: true, customLetterhead: true, financeExport: false, designIncluded: false,
  },
  big: {
    branches: null, staffLogins: null, crossBranchViews: true, storageBytes: 500 * GIB, textParts: 5000,
    appointmentRequests: true, customLetterhead: true, financeExport: true, designIncluded: true,
  },
};

/** The yes/no features a tier switches. Never one of NEVER_LIMITED (guarded in tenancy.test.ts). */
export type TierFeature = "crossBranchViews" | "appointmentRequests" | "customLetterhead" | "financeExport" | "designIncluded";

/**
 * Tiers differ by scale and service, never by patient care (ROADMAP feature 16). Nothing here may ever be a
 * TierFeature or read TIER_LIMITS. Listed so the guard test and a reviewer can check it.
 */
export const NEVER_LIMITED = [
  "patient profiles", "allergy banners", "the chart", "clinical notes", "treatment plans", "privacy and consent",
  "exporting the clinic's own data",
] as const;

const FEATURE_NAME: Record<Exclude<TierFeature, "designIncluded">, string> = {
  crossBranchViews: "Views across branches",
  appointmentRequests: "Appointment requests from the parent portal",
  customLetterhead: "A custom letterhead",
  financeExport: "Exporting the financial dashboard",
};

/** GET /clinic/support: the tier's channel with only the address that channel uses (D12). The mock and the API. */
export const clinicSupportView = (tier: Tier, settings: SupportSettings, contact: SupportContact | null): ClinicSupportView => {
  const { channel } = TIER_SUPPORT[tier];
  return { tier, channel, email: settings.email, chatUrl: channel === "email" ? null : settings.chatUrl, contact: channel === "contact" ? contact : null };
};

/** Feature 16 (revised): a parent's words when the clinic's plan has no portal appointment requests. API and mock. */
export const REQUESTS_NOT_ON_PLAN = "This clinic takes appointments by phone. Please call the clinic to book.";

/** The refusal for a feature the plan lacks, in the decision #8 voice. Shown to staff; parents get their own words. */
export const featureMessage = (tier: Tier, feature: Exclude<TierFeature, "designIncluded">) =>
  `${FEATURE_NAME[feature]} is not on the ${TIER_LABEL[tier]} plan. Contact Primolar to upgrade.`;

/**
 * D12: each tier's support, as Settings → Plan, the Plans page and the console show it. The channel decides what
 * "Contact support" opens. The addresses are data (Phase 3), never hard-coded here. No reply-time promise (D26).
 */
export const TIER_SUPPORT: Record<Tier, { channel: "email" | "chat" | "contact"; label: string; detail: string }> = {
  small: { channel: "email", label: "Email support", detail: "Email us, plus help setting up." },
  mid: { channel: "chat", label: "Priority chat", detail: "Chat with us; your questions are answered first." },
  big: { channel: "contact", label: "Your own Primolar contact", detail: "A named person to call or message, plus help moving your old records in." },
};

/**
 * May one more be added? Only ever blocks the NEXT one: after a downgrade, what exists stays usable (decision #9),
 * so `inUse` above the limit is valid data, not an error.
 */
export function canAddUnder(tier: Tier, limit: "branches" | "staffLogins", inUse: number): boolean {
  const max = TIER_LIMITS[tier][limit];
  return max === null || inUse < max;
}

/** The report filter's "All branches" value (decision #20). Never a branch id: ids are `branch_…`. */
export const ALL_BRANCHES = "all";

/**
 * The branch filter on Today, the finance dashboard and the collections list (decisions #6, #20). Undefined when it
 * isn't offered: a tier without cross-branch views, or fewer than two branches this person works at. `all` is the
 * Owner's combined total (`branches.all`). `usable` is what `usableBranches` returns for the person (ClinicContext's
 * `branches` in the app, `usableBranchesOf` in the mock API).
 */
export function reportBranchFilter(tier: Tier, roles: readonly Role[], usable: Branch[]): { branches: Branch[]; all: boolean } | undefined {
  if (!TIER_LIMITS[tier].crossBranchViews || usable.length < 2) return undefined;
  return { branches: usable, all: rolesCan(roles, "branches.all") };
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

/** What the operator and the Owner call each tier. The ids stay `small` / `mid` / `big` in code, data and the API. */
export const TIER_LABEL: Record<Tier, string> = { small: "Starter", mid: "Clinic", big: "Pro" };

/** Can sign in and be chosen for new work. A deactivated login keeps its name on what it recorded (decision #23). */
export const isActiveStaff = (staff: Pick<StaffMember, "deactivatedAt">) => !staff.deactivatedAt;

/** The Owner is an admin or a dentist (as their job or a second role), never front desk only: sign-up's rule too. */
export const canOwn = (staff: Pick<StaffMember, "role" | "alsoRoles">) => holdsRole(staff, "admin") || holdsRole(staff, "dentist");

/**
 * Why ownership can't go to this login, in plain words; undefined when it can (decision #13: exactly one Owner,
 * moved only by the operator). Only an active admin or dentist login of the same account: `staff` is that account's list.
 */
export function transferProblem(
  staff: Pick<StaffMember, "id" | "fullName" | "isOwner" | "deactivatedAt" | "role" | "alsoRoles">[],
  toStaffId: string,
): string | undefined {
  const to = staff.find((s) => s.id === toStaffId);
  if (!to) return "Choose a staff login of this clinic";
  if (to.isOwner) return `${to.fullName} is already the Owner`;
  if (!isActiveStaff(to)) return `${to.fullName}'s login is deactivated. The Owner must reactivate it before it can own the account.`;
  if (!canOwn(to)) return `The Owner must be an admin or a dentist. ${to.fullName} works at the front desk.`;
  return undefined;
}

/** Branch names match ignoring case and spaces: "Imus  Branch" is "imus branch". */
const branchNameKey = (name: string) => name.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/**
 * Why this name can't be used, in plain words; undefined when it can. Two open branches never share a name (ignoring
 * case and spaces), so staff can tell them apart. `selfId` is the branch being renamed; archived branches don't count.
 */
export function branchNameProblem(name: string, branches: Pick<Branch, "id" | "name" | "archived">[], selfId?: string): string | undefined {
  const key = branchNameKey(name);
  const same = branches.find((b) => !b.archived && b.id !== selfId && branchNameKey(b.name) === key);
  return same ? `There is already an open branch called ${same.name}. Choose another name.` : undefined;
}

/** What counts toward the limits: open branches and active logins, the Owner included (decisions #10, #37). */
export function accountUsage(data: { branches: Pick<Branch, "archived">[]; staff: Pick<StaffMember, "deactivatedAt">[] }) {
  return { branches: data.branches.filter((b) => !b.archived).length, staffLogins: data.staff.filter(isActiveStaff).length };
}

const LIMIT_NOUN = { branches: ["branch", "branches"], staffLogins: ["staff login", "staff logins"] } as const;

/**
 * The refusal at a limit (decision #8), word for word the same in the form and the API. `downgradeOn`: `tier` is the
 * smaller plan a waiting downgrade moves to on that date (B12 E13, limitTier), whose limit already counts; say so, so the
 * words agree with a Plan page that still names the current plan.
 */
export function limitMessage(tier: Tier, limit: "branches" | "staffLogins", downgradeOn?: string): string {
  const max = TIER_LIMITS[tier][limit];
  const [one, many] = LIMIT_NOUN[limit];
  const includes = `${max ?? "unlimited"} ${max === 1 ? one : many}`;
  if (downgradeOn) {
    const plan = TIER_LABEL[tier];
    return `Your plan moves to ${plan} on ${format(parseISO(downgradeOn), "d MMMM yyyy")}, and ${plan} includes ${includes}. Contact Primolar to keep your current plan.`;
  }
  return `Your ${TIER_LABEL[tier]} plan includes ${includes}. Contact Primolar to upgrade.`;
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
