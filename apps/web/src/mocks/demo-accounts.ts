import { startOfDay } from "date-fns";
import { Role, accountSummary, isActiveStaff, rolesOf, type Appointment, type DemoAccount, type Guardian, type Patient, type StaffMember, type StaffRole } from "@pedia/shared";
import { accountById, credentialOf, type Db, type Platform } from "./db";

/** Every demo account signs in with this. It is shown on the login screen and protects nothing. */
export const DEMO_PASSWORD = "pass123";

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

export type DemoAccountRecord = DemoAccount & { staffId?: string; guardianId?: string; roles: Role[] };

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

/** `demo.<clinic id>.<account id>`. Clinic ids never contain a dot; account ids may (`guardian.<id>`). */
export const tokenFor = (clinicId: string, account: { id: string }) => `demo.${clinicId}.${account.id}`;
const TOKEN = /^demo\.([^.]+)\.(.+)$/;

/** The children listing this guardian. Ownership is exactly this, computed on every request. */
export const childrenOf = (db: Db, guardianId: string): Patient[] =>
  db.patients.filter((p) => p.guardians.some((g) => g.id === guardianId));

const primaryGuardian = (p: Patient) => p.guardians.find((g) => g.isPrimary) ?? p.guardians[0];

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

const parentAccount = (db: Db, g: Guardian, summary: string): DemoAccountRecord => ({
  id: `guardian.${g.id}`,
  role: "parent",
  name: g.fullName,
  email: g.id === loginFamily(db)?.id ? PARENT_LOGIN.email : `${handle(g.fullName)}@parent.demo`,
  summary,
  guardianId: g.id,
  roles: ["parent"],
});

/** Everyone who can sign in: active staff (decision #23) and every guardian on any patient. */
export function allAccounts(db: Db): DemoAccountRecord[] {
  const guardians = new Map(db.patients.flatMap((p) => p.guardians).map((g) => [g.id, g]));
  return [...db.staff.filter(isActiveStaff).map((s) => staffAccount(s)), ...[...guardians.values()].map((g) => parentAccount(db, g, ""))];
}

/**
 * The logins the sign-in page lists: one per role from the demo clinic in role order, then the second clinic's Owner,
 * each with every clinic account its email signs in to (dentist@gmail.com names both, which is the chooser demo).
 */
export function demoLogins(platform: Platform) {
  const names = (email: string) => accountsByEmail(platform, email).map((m) => accountById(m.clinicId)!.name);
  const seen = new Set<string>();
  return platform.accounts
    .flatMap(({ id }) => allAccounts(platform.tenants[id]!).sort((a, b) => Role.options.indexOf(a.role) - Role.options.indexOf(b.role)))
    .filter((a) => LOGINS.has(a.email) && !seen.has(a.email) && seen.add(a.email))
    .map(({ role, email }) => ({ role, email, clinics: names(email) }));
}

export type AccountMatch = { clinicId: string; account: DemoAccountRecord };

/** Who a token names, and in which clinic account. Undefined for an unknown token or an unknown account. */
export function accountForToken(platform: Platform, token: string | undefined): AccountMatch | undefined {
  const [, clinicId, accountId] = token?.match(TOKEN) ?? [];
  const tenant = clinicId ? platform.tenants[clinicId] : undefined;
  const account = tenant && allAccounts(tenant).find((a) => a.id === accountId);
  return account && { clinicId: clinicId!, account };
}

/** Every login with this email, in every clinic account. Each account keeps its own logins (decision #27). */
export const accountsByEmail = (platform: Platform, email: string): AccountMatch[] =>
  platform.accounts.flatMap(({ id }) =>
    allAccounts(platform.tenants[id]!).filter((a) => a.email === email).map((account) => ({ clinicId: id, account })),
  );

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

/** Does this password open this login? Its own password once it has one (an added or changed login), else the demo one. */
export const passwordOpens = (db: Db, account: Pick<DemoAccountRecord, "staffId">, password: string) =>
  (credentialOf(db, account.staffId)?.password ?? DEMO_PASSWORD) === password;

/** The email a staff login signs in with, deactivated or not. */
export const staffEmail = (s: StaffMember) => staffAccount(s).email;

/**
 * Is this email already a login in the account? Deactivated staff count: they can be reactivated, and two logins with
 * one email would make sign-in ambiguous (decision #27: one login per email per account).
 */
export const emailTaken = (db: Db, email: string, exceptStaffId?: string) =>
  db.staff.some((s) => s.id !== exceptStaffId && staffEmail(s) === email) || allAccounts(db).some((a) => !a.staffId && a.email === email);

/** Readable at a glance and over the phone: no 0/O, 1/l/I. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY23456789";
const pick = (n: number, chars: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join("");
/**
 * "Kp7m-3xQa-9tLz": a new login's first password, shown once to whoever created it (the Owner adding staff, or the
 * operator creating an account's Owner), passed on by them, changed at first sign-in (decision #21).
 */
export const temporaryPassword = () => [pick(4, ALPHABET), pick(4, ALPHABET), pick(4, ALPHABET)].join("-");
/** A new login's Switch user PIN, shown once beside the temporary password. */
export const newPin = () => pick(4, "0123456789");
