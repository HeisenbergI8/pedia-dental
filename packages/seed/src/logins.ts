import { startOfDay } from "date-fns";
import { Role, accountSummary, isActiveStaff, rolesOf, smsNumber, type Appointment, type DemoAccount, type Guardian, type OperatorUser, type Patient, type PortalAccount, type StaffMember, type StaffRole } from "@pedia/shared";
import type { Db, Platform } from "./platform";

/** Every demo account signs in with this. It is shown on the login screen and protects nothing. */
export const DEMO_PASSWORD = "pass123";

/**
 * Primolar's own staff (decisions #3, #25). Deliberately not in `Platform`: they aren't a clinic's data, so they are
 * never inside a tenant, never listed by `allAccounts`, and can't sign in on the clinic sign-in page. One operator,
 * on the demo password.
 */
export const OPERATORS: OperatorUser[] = [{ id: "operator_primolar", name: "Primolar Support", email: "operator@primolar.demo" }];

/** One easy login per role, on fixed seed people. Everyone else keeps a generated address. */
const STAFF_LOGIN: Record<string, string> = {
  staff_villanueva: "owner@gmail.com",
  staff_delacruz: "admin@gmail.com",
  staff_reyes: "dentist@gmail.com",
  staff_cruz: "frontdesk@gmail.com",
  ngiti_staff_reyes: "dentist@gmail.com", // the same person's login at the second clinic: shows the clinic chooser
  ngiti_staff_lim: "owner@ngiti.demo",
};
/** The parent login is the two-children family (seedSibling in seed.ts): the fullest portal to show. */
const PARENT_LOGIN = { patientId: "patient_sibling", email: "parent@gmail.com" };
const LOGINS = new Set([...Object.values(STAFF_LOGIN), PARENT_LOGIN.email]);

/** Matches the portal's "Coming up" list (portal-appointments.tsx). */
const UPCOMING: Appointment["status"][] = ["booked", "confirmed", "arrived", "in_chair"];

/** `phone`: a parent's mobile sign-in (smsNumber form), when no other parent of the account signs in with it (B11 decision 14). */
export type DemoAccountRecord = DemoAccount & { staffId?: string; guardianId?: string; phone?: string; roles: Role[] };

const STAFF_SUMMARY: Record<StaffRole, string> = {
  admin: "Everything, including the financial dashboard",
  dentist: "Charts, notes and treatment plans",
  front_desk: "Appointments, billing, recalls and messages",
};
const OWNER_SUMMARY = "The whole clinic: every branch and every screen";

/** "Dr. Ana Reyes" → "ana.reyes", "Niño Peñaflor" → "nino.penaflor". */
export const handle = (fullName: string) =>
  fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^dr\.\s*/, "")
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");

/** The children listing this guardian. Ownership is exactly this, computed on every request. */
export const childrenOf = (db: Db, guardianId: string): Patient[] =>
  db.patients.filter((p) => p.guardians.some((g) => g.id === guardianId));

const primaryGuardian = (p: Patient) => p.guardians.find((g) => g.isPrimary) ?? p.guardians[0]!;

const loginFamily = (db: Db) => {
  const child = db.patients.find((p) => p.id === PARENT_LOGIN.patientId);
  return child && primaryGuardian(child);
};

const staffAccount = (s: StaffMember, pin?: string): DemoAccountRecord => ({
  id: s.id,
  role: rolesOf(s)[0]!, // the highest role held: Owner for the account's owner
  name: s.fullName,
  email: s.email ?? STAFF_LOGIN[s.id] ?? `${handle(s.fullName)}@pediadental.demo`, // the Owner typed it for added staff
  summary: s.isOwner ? OWNER_SUMMARY : STAFF_SUMMARY[s.role],
  staffId: s.id,
  roles: rolesOf(s),
  pin,
});

/** The address a seeded parent signs in with: parent@gmail.com for the sibling family, else a generated one. */
const demoEmail = (db: Db, g: Guardian) => (g.id === loginFamily(db)?.id ? PARENT_LOGIN.email : `${handle(g.fullName)}@parent.demo`);
export const portalAccountOf = (db: Db, guardianId: string | undefined) =>
  guardianId ? db.portalAccounts.find((a) => a.guardianId === guardianId) : undefined;

const parentAccount = (db: Db, g: Guardian, summary: string, phone?: string): DemoAccountRecord => ({
  id: `guardian.${g.id}`,
  role: "parent",
  name: g.fullName,
  email: portalAccountOf(db, g.id)?.email ?? "", // "": signs in with their number only (B11 decision 14)
  phone,
  summary,
  guardianId: g.id,
  roles: ["parent"],
});

/**
 * Everyone who can sign in: active staff (decision #23) and, since B11, every guardian on a patient whose portal
 * account is active. A guardian on no child any more isn't listed (decision 10). Their mobile is read live from the
 * guardian (decision 15); a number another parent already signs in with goes to the first only (decision 14).
 */
export function allAccounts(db: Db): DemoAccountRecord[] {
  const guardians = new Map(db.patients.flatMap((p) => p.guardians).map((g) => [g.id, g]));
  const taken = new Set<string>();
  const parents = [...guardians.values()]
    .filter((g) => portalAccountOf(db, g.id)?.state === "active")
    .map((g) => {
      const n = smsNumber(g.phone);
      const phone = n && !taken.has(n) ? (taken.add(n), n) : undefined;
      return parentAccount(db, g, "", phone);
    });
  return [...db.staff.filter(isActiveStaff).map((s) => staffAccount(s)), ...parents];
}

const clinicName = (platform: Platform, id: string) => platform.accounts.find((a) => a.id === id)!.name;

/**
 * The logins the sign-in page lists: one per role from the demo clinic in role order, then the second clinic's Owner,
 * each with every clinic account its email signs in to (dentist@gmail.com names both, which is the chooser demo).
 */
export function demoLogins(platform: Platform) {
  const names = (email: string) => accountsByLogin(platform, email).map((m) => clinicName(platform, m.clinicId));
  const seen = new Set<string>();
  return platform.accounts
    .flatMap(({ id }) => allAccounts(platform.tenants[id]!).sort((a, b) => Role.options.indexOf(a.role) - Role.options.indexOf(b.role)))
    .filter((a) => LOGINS.has(a.email) && !seen.has(a.email) && seen.add(a.email))
    .map(({ role, email }) => ({ role, email, clinics: names(email) }));
}

export type AccountMatch = { clinicId: string; account: DemoAccountRecord };

/** Every login with this email or mobile (LoginId's form), in every clinic account (decision #27; B11 decision 4). */
export const accountsByLogin = (platform: Platform, login: string): AccountMatch[] =>
  platform.accounts.flatMap(({ id }) =>
    allAccounts(platform.tenants[id]!).filter((a) => a.email === login || a.phone === login).map((account) => ({ clinicId: id, account })),
  );

/**
 * B11 decision 13: one active account per guardian, on the demo password, with the generated demo address. Dated by
 * the guardian's first child's registration, so it is the same on every load.
 */
export function seedPortalAccounts(db: Db): PortalAccount[] {
  const firsts = new Map<string, { g: Guardian; at: string; clinicId: string }>();
  for (const p of db.patients) for (const g of p.guardians) if (!firsts.has(g.id)) firsts.set(g.id, { g, at: p.createdAt, clinicId: p.clinicId });
  return [...firsts.values()].map(({ g, at, clinicId }) => ({ clinicId, guardianId: g.id, state: "active", activatedAt: at, email: demoEmail(db, g), links: [] }));
}

/**
 * The accounts on the login screen: all staff, then three parents picked by what they demonstrate.
 * Derived from the data, not hard-coded, so they stay true as the demo changes the data.
 */
export function demoAccounts(db: Db): DemoAccountRecord[] {
  // The child's next visit (what portal Home shows) must be the booked one, or Home has nothing to confirm.
  const today = startOfDay(new Date()).toISOString();
  const next = new Map<string, Appointment>();
  for (const a of [...db.appointments].sort((x, y) => x.startsAt.localeCompare(y.startsAt))) {
    if (UPCOMING.includes(a.status) && a.startsAt >= today && !next.has(a.patientId)) next.set(a.patientId, a);
  }
  const toConfirm = new Set([...next.values()].filter((a) => a.status === "booked").map((a) => a.patientId));
  const owes = (p: Patient) =>
    accountSummary(db.invoices.filter((i) => i.patientId === p.id), db.payments).balance > 0;
  const seen = new Set<string>();
  const pick = (summary: string, match: (p: Patient) => boolean): DemoAccountRecord[] => {
    const child = db.patients.find((p) => !seen.has(primaryGuardian(p).id) && match(p));
    if (!child) return [];
    const guardian = primaryGuardian(child);
    seen.add(guardian.id);
    return [parentAccount(db, guardian, summary)];
  };
  return [
    ...db.staff.filter(isActiveStaff).map((s) => staffAccount(s, db.staffPins.find((p) => p.staffId === s.id)?.pin)),
    ...pick("Two children, one mid-treatment", (p) => childrenOf(db, primaryGuardian(p).id).length > 1),
    ...pick("Has an unpaid balance", owes),
    ...pick("Has an appointment to confirm", (p) => toConfirm.has(p.id)),
  ];
}

/** The email a staff login signs in with, deactivated or not. */
export const staffEmail = (s: StaffMember) => staffAccount(s).email;
