import { z } from "zod";
import { BranchScoped, Centavos, ClinicScoped, Id, StaffRole } from "./common";

export const StaffMember = ClinicScoped.extend({
  id: Id,
  fullName: z.string().min(1),
  role: StaffRole, // the primary job: what the staff list and labels show
  alsoRoles: z.array(StaffRole).optional(), // a second staff role held too (decisions #12, #39), e.g. Admin + Dentist
  isOwner: z.boolean().optional(), // exactly one per account (decision #13); seeded, transferred only by the operator
  branchIds: z.array(Id).min(1), // where they work (decision #14). The Owner works everywhere regardless (`branches.all`)
  licenseNo: z.string().optional(), // PRC license, dentists only
});
export type StaffMember = z.infer<typeof StaffMember>;

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
