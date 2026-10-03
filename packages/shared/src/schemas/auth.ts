import { z } from "zod";
import { Id, Role } from "./common";

/**
 * Every access decision names one of these. Who holds which is `ROLE_PERMISSIONS` in
 * domain/permissions.ts: change access there, never with a role check in a component or handler.
 */
export const Permission = z.enum([
  "dashboard.view",
  "patients.view",
  "patients.write",
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

/** Prototype only: the one-click accounts on the login screen. NestJS won't serve this. */
export const DemoAccount = SessionUser.pick({ id: true, role: true, name: true, email: true }).extend({
  summary: z.string(), // "Two children, one mid-treatment"
});
export type DemoAccount = z.infer<typeof DemoAccount>;
export const DemoAccounts = z.object({ password: z.string(), accounts: z.array(DemoAccount) });
export type DemoAccounts = z.infer<typeof DemoAccounts>;
