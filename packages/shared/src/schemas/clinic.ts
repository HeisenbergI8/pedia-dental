import { z } from "zod";
import { Centavos, ClinicScoped, Id, Role } from "./common";

export const StaffMember = ClinicScoped.extend({
  id: Id,
  fullName: z.string().min(1),
  role: Role.exclude(["parent"]),
  licenseNo: z.string().optional(), // PRC license, dentists only
});
export type StaffMember = z.infer<typeof StaffMember>;

export const Chair = ClinicScoped.extend({
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
