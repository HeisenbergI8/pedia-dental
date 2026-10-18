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

/** One colour as #rrggbb, stored lowercase. Whether it may be the brand colour is `brandColorProblem` (domain/branding). */
export const HexColor = z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, "Enter a colour as # and six letters or digits");

/** The heading-font shortlist (decisions #28, #53): rounded, legible at heading sizes, on Google Fonts. On every plan (billing #8). */
export const HeadingFont = z.enum(["nunito", "poppins", "lexend", "quicksand", "outfit", "fredoka"]);
export type HeadingFont = z.infer<typeof HeadingFont>;
export const HEADING_FONT_LABEL: Record<HeadingFont, string> = {
  nunito: "Nunito",
  poppins: "Poppins",
  lexend: "Lexend",
  quicksand: "Quicksand",
  outfit: "Outfit",
  fredoka: "Fredoka",
};

/** One paying dental business (the tenant), with its branding (decisions #18, #28–#31). */
export const ClinicAccount = z.object({
  id: Id,
  name: z.string().trim().min(1, "Enter the clinic's name"),
  logoRef: z.string().optional(), // a blob-store key from Owner settings, or `demo/<file>` for a seeded logo in public/
  contactEmail: z.string().trim().toLowerCase().email("Enter the clinic's email address, like hello@clinic.ph"),
  // Decision #42: 123-456-789, plus an optional 3–5 digit branch code. formatTin (domain/tenancy) adds the dashes.
  tin: z.string().trim().regex(/^\d{3}-\d{3}-\d{3}(-\d{3,5})?$/, "Enter the TIN like 123-456-789, with the branch code after it if there is one"),
  tier: Tier,
  status: AccountStatus,
  brandColor: HexColor, // decision #29: tints, shades and the dark version are derived (deriveBrandPalette), never stored
  headingFont: HeadingFont.optional(), // billing #8: any plan; unset = the app's own heading font
});
export type ClinicAccount = z.infer<typeof ClinicAccount>;

/** One physical location. Archived, never deleted: it leaves the switcher and booking, its history stays (decision #22). */
export const Branch = ClinicScoped.extend({
  id: Id,
  name: z.string().trim().min(1, "Enter the branch name"),
  address: z.string().trim().min(1, "Enter the branch address"),
  phone: z
    .string()
    .trim()
    .min(1, "Enter the branch phone number")
    .refine((p) => /^[\d\s()+-]+$/.test(p) && p.replace(/\D/g, "").length >= 7, "Enter a phone number, like (046) 471 2580 or 0917 123 4567"),
  openingHours: OpeningHours,
  archived: z.boolean(),
});
export type Branch = z.infer<typeof Branch>;

/**
 * GET /clinic: the signed-in account, the branches this user may work at (not archived), and the one this device is
 * on. The server decides `activeBranchId` (the `pd_branch` cookie when it is one of `branches`, else the first).
 */
export const ClinicContext = z.object({
  account: ClinicAccount,
  branches: z.array(Branch).min(1),
  activeBranchId: Id,
  logoUrl: z.string().nullable(), // null: no logo, so the clinic's name shows in its heading font (decision #31)
});
export type ClinicContext = z.infer<typeof ClinicContext>;

/** PUT /clinic: what the Owner edits about the account (decision #18). Tier and status are the operator's. */
export const UpdateClinicProfileInput = ClinicAccount.pick({ name: true, contactEmail: true, tin: true });
export type UpdateClinicProfileInput = z.infer<typeof UpdateClinicProfileInput>;

/** PUT /clinic/branding. `headingFont: null` goes back to the app's own. The logo is a file, so it has its own route. */
export const UpdateBrandingInput = z.object({ brandColor: HexColor, headingFont: HeadingFont.nullable() });
export type UpdateBrandingInput = z.infer<typeof UpdateBrandingInput>;

/** POST /branches and PUT /branches/:id. Archiving is its own action (decision #22), never a field. */
export const BranchInput = Branch.pick({ name: true, address: true, phone: true, openingHours: true });
export type BranchInput = z.infer<typeof BranchInput>;

export const Allowance = z.object({ inUse: z.number().int().nonnegative(), limit: z.number().int().positive().nullable() });
export type Allowance = z.infer<typeof Allowance>;
/**
 * GET /clinic/usage: what counts toward the tier's limits now (decisions #10, #37), beside the limits. null = unlimited.
 * B12: storage in bytes and texts in billed parts for `month` (the Manila calendar month, decisions 17, 18).
 */
export const ClinicUsage = z.object({
  tier: Tier,
  branches: Allowance,
  staffLogins: Allowance,
  storage: Allowance,
  texts: Allowance,
  month: z.string().regex(/^\d{4}-\d{2}$/),
});
export type ClinicUsage = z.infer<typeof ClinicUsage>;
