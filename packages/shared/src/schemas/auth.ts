import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, Role } from "./common";
import { AcknowledgementKind } from "./legal";

/**
 * Every access decision names one of these. Who holds which is `ROLE_PERMISSIONS` in
 * domain/permissions.ts: change access there, never with a role check in a component or handler.
 */
export const Permission = z.enum([
  "dashboard.view",
  "today.view", // today at a glance on the dashboard: every staff role
  "patients.view",
  "patients.write",
  "patients.contact", // guardian phones and emails, emergency contact, address: sent only with this (own = a parent's family)
  "appointments.view",
  "appointments.manage",
  "appointments.confirm",
  "appointments.request",
  "clinical.view",
  "clinical.write",
  "plan.view",
  "plan.write",
  "billing.view",
  "billing.collect",
  "billing.adjust", // refunds (on a bill or a deposit) and voiding a bill: the Owner and admins (B8 decisions 2, 3)
  "recalls.manage",
  "messages.view",
  "messages.manage",
  "documents.issue",
  "uploads.create",
  "clinic.view",
  "settings.view",
  "audit.view",
  "session.switch", // hand a shared device to another staff member, with their own PIN
  "branches.all", // works at every branch of the account, whatever their assignment: the Owner
  "clinic.manage", // Owner settings: the account's profile, branding, branches and staff logins (decision #11)
  "consents.manage", // privacy #15 (P16): switch a child's optional consents (photos, reminders). A parent: their own
]);
export type Permission = z.infer<typeof Permission>;

/** `all`: any record in the clinic. `own`: only the signed-in parent's children, checked by the API. */
export const PermissionScope = z.enum(["all", "own"]);
export type PermissionScope = z.infer<typeof PermissionScope>;

/** Who is signed in. Staff carry their StaffMember id, parents their Guardian id. */
export const SessionUser = z.object({
  id: Id,
  role: Role,
  name: z.string(),
  email: z.string(),
  clinicId: Id, // the clinic account this login belongs to (one login, one account: decision #27)
  // Every role held, highest first (Role order); `role` is roles[0], kept for labels and the home page. Access is the
  // union of all of them (`rolesCan`), so an Admin + Dentist can sign notes and an Owner + Dentist is a bookable dentist.
  roles: z.array(Role).min(1),
  // A parent whose clinic is suspended (decision #44): reads work, every portal change is refused. Staff of a
  // suspended clinic never get a session at all (decisions #26, #41).
  readOnly: z.boolean().optional(),
  // A login the Owner just created (decision #21): until they choose their own password, every API route but /auth/*
  // answers 403 and the app shows only "Choose your password".
  mustChangePassword: z.boolean().optional(),
  // Privacy #9, #20, #21 (P10): what this login must read first. `terms` and `confidentiality` make every API route but
  // /auth/* answer 403; `notice` is the portal's own step. The app shows only the acknowledgement page meanwhile.
  mustAcknowledge: AcknowledgementKind.optional(),
  staffId: Id.optional(),
  guardianId: Id.optional(),
});
export type SessionUser = z.infer<typeof SessionUser>;

/** The prototype's token is an opaque string. NestJS will use an httpOnly cookie instead (Q4). */
export const Session = z.object({ token: z.string().min(1), user: SessionUser });
export type Session = z.infer<typeof Session>;

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email address, like name@example.com"),
  password: z.string().min(1, "Enter your password"),
  clinicId: Id.optional(), // sent on the second step, once the person has picked a clinic
});
export type LoginInput = z.infer<typeof LoginInput>;

/** One clinic an email belongs to, for the chooser. Only the name: nothing else is shown before a clinic is picked. */
export const ClinicChoice = z.object({ clinicId: Id, name: z.string() });
export type ClinicChoice = z.infer<typeof ClinicChoice>;

/** POST /auth/login: a session, or, when the email is in several clinic accounts it may use, which one (decision #27). */
export const LoginResult = z.union([Session, z.object({ choices: z.array(ClinicChoice).min(2) })]);
export type LoginResult = z.infer<typeof LoginResult>;

/** `idle`: the app signed the user out after a period of inactivity, logged as "timed out". */
export const LogoutInput = z.object({ reason: z.enum(["user", "idle"]).default("user") });
export type LogoutInput = z.input<typeof LogoutInput>;

/** Four digits: quick on a front-desk keypad, and the attempt limit (domain/pin.ts) makes guessing slow. */
const Pin = z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN");

/** A staff switch on a shared device: who is taking over, and that person's own PIN. Never a shared login. */
export const SwitchUserInput = z.object({ accountId: z.string().min(1, "Choose who is taking over"), pin: Pin });
export type SwitchUserInput = z.infer<typeof SwitchUserInput>;

/**
 * A staff member's PIN and their recent wrong tries (for the lockout). Stored, never served. The prototype keeps
 * the PIN as typed. NestJS stores a slow hash and the same `failedAt` list (or a counter) on the user.
 */
export const StaffPin = ClinicScoped.extend({ staffId: Id, pin: Pin, failedAt: z.array(IsoDateTime) });
export type StaffPin = z.infer<typeof StaffPin>;

/**
 * A staff login's own password, once it has one (added by the Owner, or changed). Logins without one sign in with the
 * demo password. Stored, never served. The prototype keeps it as typed, like PINs; NestJS stores a slow hash.
 */
export const StaffCredential = ClinicScoped.extend({ staffId: Id, password: z.string().min(8), mustChange: z.boolean() });
export type StaffCredential = z.infer<typeof StaffCredential>;

/** POST /auth/password. `current` is the temporary password at first sign-in. */
export const ChangePasswordInput = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(8, "Use at least 8 characters"),
  })
  .refine((p) => p.next !== p.current, { message: "Choose a password different from the temporary one", path: ["next"] });
export type ChangePasswordInput = z.infer<typeof ChangePasswordInput>;

/** Prototype only: the one-click accounts on the login screen. NestJS won't serve this. */
export const DemoAccount = SessionUser.pick({ id: true, role: true, name: true, email: true }).extend({
  summary: z.string(), // "Two children, one mid-treatment"
  pin: Pin.optional(), // staff only: their demo PIN, shown on the login screen like the demo password
});
export type DemoAccount = z.infer<typeof DemoAccount>;
export const DemoAccounts = z.object({
  password: z.string(),
  accounts: z.array(DemoAccount), // with PINs, for the staff switch
  // One per role, listed on the sign-in page, with the clinic accounts each email signs in to.
  logins: z.array(DemoAccount.pick({ role: true, email: true }).extend({ clinics: z.array(z.string()).min(1) })),
});
export type DemoAccounts = z.infer<typeof DemoAccounts>;
