import { z } from "zod";
import { BranchScoped, Centavos, ClinicScoped, Id, IsoDateTime, StaffRole } from "./common";

const StaffEmail = z.string().trim().toLowerCase().email("Enter their email address, like name@example.com");

export const StaffMember = ClinicScoped.extend({
  id: Id,
  fullName: z.string().min(1),
  role: StaffRole, // the primary job: what the staff list and labels show
  alsoRoles: z.array(StaffRole).optional(), // a second staff role held too (decisions #12, #39), e.g. Admin + Dentist
  isOwner: z.boolean().optional(), // exactly one per account (decision #13); seeded, transferred only by the operator
  branchIds: z.array(Id).min(1), // where they work (decision #14). The Owner works everywhere regardless (`branches.all`)
  licenseNo: z.string().optional(), // PRC license, dentists only
  email: StaffEmail.optional(), // their sign-in email; set when the Owner adds them. Seeded staff derive theirs (demo-accounts.ts)
  // Decision #23: can't sign in or be chosen for new work; their name stays on what they recorded. Frees a seat (#10).
  deactivatedAt: IsoDateTime.optional(),
});
export type StaffMember = z.infer<typeof StaffMember>;

/**
 * POST /staff (decision #21): the Owner enters name, email, role and branches. Never `isOwner`: there is exactly one
 * Owner (#13) and only the operator transfers it.
 */
export const AddStaffInput = z.object({
  fullName: z.string().trim().min(1, "Enter their full name"),
  email: StaffEmail,
  role: StaffRole,
  alsoRoles: z.array(StaffRole).max(1).optional(),
  branchIds: z.array(Id).min(1, "Choose at least one branch"),
  licenseNo: z.string().trim().optional(),
});
export type AddStaffInput = z.infer<typeof AddStaffInput>;

/** The new login, and the only time its temporary password and PIN are ever sent (decision #21). */
export const AddStaffResult = z.object({ staff: StaffMember, temporaryPassword: z.string().min(8), pin: z.string().regex(/^\d{4}$/) });
export type AddStaffResult = z.infer<typeof AddStaffResult>;

export const Chair = BranchScoped.extend({
  id: Id,
  name: z.string().min(1),
});
export type Chair = z.infer<typeof Chair>;

/**
 * One billable procedure. `code` is also the key that note templates and
 * follow-up rules use (`findRule(code)`), so the rule isn't stored twice.
 */
export const Procedure = ClinicScoped.extend({
  code: z.string().regex(/^[a-z_]+$/),
  name: z.string().min(1),
  defaultDurationMin: z.number().int().positive(),
  fee: Centavos.nonnegative(),
  perTooth: z.boolean(), // fee is charged per tooth treated
});
export type Procedure = z.infer<typeof Procedure>;
