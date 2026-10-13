import { z } from "zod";
import { AddStaffInput } from "./clinic";
import { Id, Role } from "./common";
import { Branch, ClinicAccount, Tier } from "./tenancy";

/**
 * Primolar's own staff (decisions #3, #25). Not a clinic user: no clinicId, no role, no Permission. Its token is
 * `operator.<id>` and is refused by every clinic route; clinic tokens are refused by every /operator route.
 */
export const OperatorUser = z.object({ id: Id, name: z.string(), email: z.string() });
export type OperatorUser = z.infer<typeof OperatorUser>;

/** POST /operator/auth/login. Its own shape, so a clinic Session can never be mistaken for it (or the reverse). */
export const OperatorSession = z.object({ token: z.string().regex(/^operator\./), operator: OperatorUser });
export type OperatorSession = z.infer<typeof OperatorSession>;

export const OperatorLoginInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter your email address, like name@example.com"),
  password: z.string().min(1, "Enter your password"),
});
export type OperatorLoginInput = z.infer<typeof OperatorLoginInput>;

/**
 * GET /operator/accounts, one row per clinic account: what decision #25 lets the operator see, and nothing more.
 * Strict at every level: a stray field (a patient name, a branch address) fails the parse instead of reaching the
 * console. Counts only, never rows.
 */
export const AccountOverview = z.strictObject({
  account: z.strictObject(ClinicAccount.pick({ id: true, name: true, contactEmail: true, tier: true, status: true }).shape),
  owner: z.strictObject({ staffId: Id, name: z.string(), email: z.string() }).nullable(), // null only if data is broken
  usage: z.strictObject({
    branches: z.number().int().nonnegative(), // open branches (decision #10)
    staffLogins: z.number().int().nonnegative(), // active logins, the Owner included (#37)
    patients: z.number().int().nonnegative(), // a count: the operator never sees a patient record (#25)
  }),
});
export type AccountOverview = z.infer<typeof AccountOverview>;

/**
 * POST /operator/accounts (decision #3): the account, its first branch, and its Owner. The Owner's job role is Admin
 * or Dentist (an Owner + Dentist, like the demo's Dr. Villanueva). Brand colour starts at Primolar's default; the
 * Owner sets the rest in Settings.
 */
export const CreateAccountInput = z.object({
  account: ClinicAccount.pick({ name: true, contactEmail: true, tin: true, tier: true }),
  branch: Branch.pick({ name: true, address: true, phone: true }),
  owner: AddStaffInput.pick({ fullName: true, email: true }).extend({ role: z.enum(["admin", "dentist"]) }),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

/** The new account's row, and the only time the Owner's temporary password and PIN are sent (decision #21). */
export const CreateAccountResult = z.object({
  overview: AccountOverview,
  temporaryPassword: z.string().min(8),
  pin: z.string().regex(/^\d{4}$/),
});
export type CreateAccountResult = z.infer<typeof CreateAccountResult>;

/** PUT /operator/accounts/:id/tier (decision #4: by hand, no payments). Nothing is disabled on a downgrade (#9). */
export const ChangeTierInput = z.object({ tier: Tier });
export type ChangeTierInput = z.infer<typeof ChangeTierInput>;

/** GET /operator/accounts/:id/staff: who ownership may go to. Active, non-Owner staff logins only (decision #13). */
export const OwnerCandidate = z.strictObject({ staffId: Id, name: z.string(), email: z.string(), roles: z.array(Role).min(1) });
export type OwnerCandidate = z.infer<typeof OwnerCandidate>;

/** POST /operator/accounts/:id/owner. */
export const TransferOwnershipInput = z.object({ staffId: Id });
export type TransferOwnershipInput = z.infer<typeof TransferOwnershipInput>;
