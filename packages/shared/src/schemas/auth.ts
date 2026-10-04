import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, Role } from "./common";

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
  "recalls.manage",
  "messages.view",
  "messages.manage",
  "documents.issue",
  "uploads.create",
  "clinic.view",
  "settings.view",
  "audit.view",
  "session.switch", // hand a shared device to another staff member, with their own PIN
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
});
export type LoginInput = z.infer<typeof LoginInput>;

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

/** Prototype only: the one-click accounts on the login screen. NestJS won't serve this. */
export const DemoAccount = SessionUser.pick({ id: true, role: true, name: true, email: true }).extend({
  summary: z.string(), // "Two children, one mid-treatment"
  pin: Pin.optional(), // staff only: their demo PIN, shown on the login screen like the demo password
});
export type DemoAccount = z.infer<typeof DemoAccount>;
export const DemoAccounts = z.object({
  password: z.string(),
  accounts: z.array(DemoAccount), // with PINs, for the staff switch
  logins: z.array(DemoAccount.pick({ role: true, email: true })), // one per role, listed on the sign-in page
});
export type DemoAccounts = z.infer<typeof DemoAccounts>;
