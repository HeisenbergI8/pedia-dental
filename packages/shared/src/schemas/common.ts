import { z } from "zod";

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** Every record belongs to one clinic account (the tenant). Mock handlers only ever see the signed-in account's rows. */
export const ClinicScoped = z.object({ clinicId: Id });
/** Records that also belong to one branch of the account: appointments, chairs, invoices and payments (decision #16). */
export const BranchScoped = ClinicScoped.extend({ branchId: Id });

/** Calendar date, YYYY-MM-DD. Pass a message to word the error for a specific field. */
export const isoDate = (message = "Enter a date") => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);
export const IsoDate = isoDate();
/** Full timestamp, ISO 8601. */
export const IsoDateTime = z.string().datetime({ offset: true });

/** Money is always integer centavos. Never floats. */
export const Centavos = z.number().int();
export type Centavos = z.infer<typeof Centavos>;

/** Who is signed in. `owner` is the account's master login (decision #11), above admin; never a job on a staff record. */
export const Role = z.enum(["owner", "admin", "dentist", "front_desk", "parent"]);
export type Role = z.infer<typeof Role>;
/** The job on a staff record. An Owner keeps one too (Owner + Dentist), which is what books, signs and charts. */
export const StaffRole = Role.exclude(["owner", "parent"]);
export type StaffRole = z.infer<typeof StaffRole>;
