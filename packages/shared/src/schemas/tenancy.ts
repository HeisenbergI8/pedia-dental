import { z } from "zod";
import { ClinicScoped, Id } from "./common";

/** What the clinic account is on. Limits per tier are TIER_LIMITS (domain/tenancy.ts), never `if` statements. */
export const Tier = z.enum(["small", "mid", "big"]);
export type Tier = z.infer<typeof Tier>;

/** `suspended`: staff can't sign in, parents keep read-only access, every record is kept (decisions #26, #44). */
export const AccountStatus = z.enum(["active", "suspended"]);
export type AccountStatus = z.infer<typeof AccountStatus>;

/** Minutes from local midnight, plus the weekdays (0 = Sunday) the branch never opens. */
export const OpeningHours = z
  .object({
    opensAt: z.number().int().min(0).max(24 * 60),
    closesAt: z.number().int().min(0).max(24 * 60),
    closedWeekdays: z.array(z.number().int().min(0).max(6)),
  })
  .refine((h) => h.opensAt < h.closesAt, { message: "Closing time must be after opening time", path: ["closesAt"] });
export type OpeningHours = z.infer<typeof OpeningHours>;

/** One paying dental business (the tenant). Its branding beyond the logo reference comes with the branding plan. */
export const ClinicAccount = z.object({
  id: Id,
  name: z.string().trim().min(1, "Enter the clinic's name"),
  logoRef: z.string().optional(), // a blob-store key, set by Owner settings
  contactEmail: z.string().trim().toLowerCase().email("Enter the clinic's email address, like hello@clinic.ph"),
  tin: z.string().regex(/^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/, "Enter the TIN like 123-456-789-000"),
  tier: Tier,
  status: AccountStatus,
});
export type ClinicAccount = z.infer<typeof ClinicAccount>;

/** One physical location. Archived, never deleted: it leaves the switcher and booking, its history stays (decision #22). */
export const Branch = ClinicScoped.extend({
  id: Id,
  name: z.string().trim().min(1, "Enter the branch name"),
  address: z.string().trim().min(1, "Enter the branch address"),
  phone: z.string().trim().min(1, "Enter the branch phone number"),
  openingHours: OpeningHours,
  archived: z.boolean(),
});
export type Branch = z.infer<typeof Branch>;

/**
 * GET /clinic: the signed-in account, the branches this user may work at (not archived), and the one this device is
 * on. The server decides `activeBranchId` (the `pd_branch` cookie when it is one of `branches`, else the first).
 */
export const ClinicContext = z.object({ account: ClinicAccount, branches: z.array(Branch).min(1), activeBranchId: Id });
export type ClinicContext = z.infer<typeof ClinicContext>;
