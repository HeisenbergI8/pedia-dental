import { startOfDay } from "date-fns";
import { Role, accountSummary, type Appointment, type DemoAccount, type Guardian, type Patient, type StaffMember } from "@pedia/shared";
import type { Db } from "./db";

/** Every demo account signs in with this. It is shown on the login screen and protects nothing. */
export const DEMO_PASSWORD = "pass123";

/** One easy login per role, on fixed seed people. Everyone else keeps a generated address. */
const STAFF_LOGIN: Record<string, string> = {
  staff_delacruz: "admin@gmail.com",
  staff_reyes: "dentist@gmail.com",
  staff_cruz: "frontdesk@gmail.com",
};
/** The parent login is the two-children family (seedSibling in seed.ts): the fullest portal to show. */
const PARENT_LOGIN = { patientId: "patient_sibling", email: "parent@gmail.com" };
const LOGINS = new Set([...Object.values(STAFF_LOGIN), PARENT_LOGIN.email]);

/** Matches the portal's "Coming up" list (portal-appointments.tsx). */
const UPCOMING: Appointment["status"][] = ["booked", "confirmed", "arrived", "in_chair"];

export type DemoAccountRecord = DemoAccount & { staffId?: string; guardianId?: string };

const STAFF_SUMMARY: Record<StaffMember["role"], string> = {
  admin: "Everything, including the financial dashboard",
  dentist: "Charts, notes and treatment plans",
  front_desk: "Appointments, billing, recalls and messages",
};

/** "Dr. Ana Reyes" → "ana.reyes", "Niño Peñaflor" → "nino.penaflor". */
const handle = (fullName: string) =>
  fullName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^dr\.\s*/, "")
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.|\.$/g, "");

export const tokenFor = (account: { id: string }) => `demo.${account.id}`;

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
  role: s.role,
  name: s.fullName,
  email: STAFF_LOGIN[s.id] ?? `${handle(s.fullName)}@pediadental.demo`,
  summary: STAFF_SUMMARY[s.role],
  staffId: s.id,
  pin,
});

const parentAccount = (db: Db, g: Guardian, summary: string): DemoAccountRecord => ({
  id: `guardian.${g.id}`,
  role: "parent",
  name: g.fullName,
  email: g.id === loginFamily(db)?.id ? PARENT_LOGIN.email : `${handle(g.fullName)}@parent.demo`,
  summary,
  guardianId: g.id,
});

/** Everyone who can sign in: all staff and every guardian on any patient. */
export function allAccounts(db: Db): DemoAccountRecord[] {
  const guardians = new Map(db.patients.flatMap((p) => p.guardians).map((g) => [g.id, g]));
  return [...db.staff.map((s) => staffAccount(s)), ...[...guardians.values()].map((g) => parentAccount(db, g, ""))];
}

/** The logins the sign-in page lists, one per role, in role order. */
export const demoLogins = (db: Db) =>
  allAccounts(db)
    .filter((a) => LOGINS.has(a.email))
    .sort((a, b) => Role.options.indexOf(a.role) - Role.options.indexOf(b.role))
    .map(({ role, email }) => ({ role, email }));

export const accountForToken = (db: Db, token: string | undefined) =>
  token ? allAccounts(db).find((a) => tokenFor(a) === token) : undefined;

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
    ...db.staff.map((s) => staffAccount(s, db.staffPins.find((p) => p.staffId === s.id)?.pin)),
    ...pick("Two children, one mid-treatment", (p) => childrenOf(db, primaryGuardian(p).id).length > 1),
    ...pick("Has an unpaid balance", owes),
    ...pick("Has an appointment to confirm", (p) => toConfirm.has(p.id)),
  ];
}
