import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime, TEXT_COLUMN_MAX, YearMonth, nameText, tooLong } from "./common";

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

/** The longest clinic name (audit #4): it is the first words of every portal invite and reset text. */
export const CLINIC_NAME_MAX = 80;

/** One paying dental business (the tenant), with its branding (decisions #18, #28–#31). */
export const ClinicAccount = z.object({
  id: Id,
  // Audit #4: the name is in every account text (invites, resets), so it is capped like a text's other parts.
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

/** A landline or a mobile: digits, spaces, ( ) + and -, and at least 7 digits (the branch phone rule). */
export const isPhoneNumber = (p: string) => /^[\d\s()+-]+$/.test(p) && p.replace(/\D/g, "").length >= 7;
const PHONE_MESSAGE = "Enter a phone number, like (046) 471 2580 or 0917 123 4567";
/** The longest phone number kept (the guardian and support-contact columns). */
export const PHONE_MAX = 32;

/** One physical location. Archived, never deleted: it leaves the switcher and booking, its history stays (decision #22). */
export const Branch = ClinicScoped.extend({
  id: Id,
  name: z.string().trim().min(1, "Enter the branch name"),
  address: z.string().trim().min(1, "Enter the branch address"),
  phone: z.string().trim().min(1, "Enter the branch phone number").refine(isPhoneNumber, PHONE_MESSAGE),
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
/** Audit #4: a name typed now is capped (it starts every text); a stored name is read as it is, so old rows never fail. */
// Issue 26: invisible characters removed and lookalikes folded (nameText), so two names that look alike are one.
export const ClinicNameInput = nameText("Enter the clinic's name", CLINIC_NAME_MAX, "the clinic's name");
export const UpdateClinicProfileInput = ClinicAccount.pick({ name: true, contactEmail: true, tin: true }).extend({ name: ClinicNameInput });
export type UpdateClinicProfileInput = z.infer<typeof UpdateClinicProfileInput>;

/** PUT /clinic/branding. `headingFont: null` goes back to the app's own. The logo is a file, so it has its own route. */
export const UpdateBrandingInput = z.object({ brandColor: HexColor, headingFont: HeadingFont.nullable() });
export type UpdateBrandingInput = z.infer<typeof UpdateBrandingInput>;

/** POST /branches and PUT /branches/:id. Archiving is its own action (decision #22), never a field. */
// Typed text is capped at the columns' size (issue 5); stored branches are read as they are.
export const BranchInput = Branch.pick({ name: true, address: true, phone: true, openingHours: true }).extend({
  name: nameText("Enter the branch name", TEXT_COLUMN_MAX, "the branch name"),
  address: Branch.shape.address.max(TEXT_COLUMN_MAX, tooLong(TEXT_COLUMN_MAX, "the address")),
  phone: Branch.shape.phone.max(PHONE_MAX, tooLong(PHONE_MAX, "the phone number")),
});
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
  texts: Allowance, // limit = the plan's parts + this month's top-ups (textAllowance)
  textTopUp: z.number().int().nonnegative(), // the top-up part of texts.limit
  month: YearMonth,
});
export type ClinicUsage = z.infer<typeof ClinicUsage>;

/** D12: Primolar's support addresses (GET and PUT /operator/support). Null until the operator sets them. */
export const SupportSettings = z.object({
  email: z.string().trim().toLowerCase().email("Enter an email address, like help@primolar.ph").nullable(),
  // https only: the Owner's dialog opens it as a link, so no other scheme (javascript:, data:) may get in.
  chatUrl: z.string().trim().url("Enter the chat link, starting with https://").refine((u) => /^https:\/\//i.test(u), "Enter the chat link, starting with https://").nullable(),
});
export type SupportSettings = z.infer<typeof SupportSettings>;

/** D12: a Pro clinic's named Primolar contact (GET and PUT /operator/accounts/:id/support-contact). */
export const SupportContact = z.object({
  name: z.string().trim().min(1, "Enter the contact's name").max(120),
  phone: z.string().trim().max(32).nullable(),
  email: z.string().trim().toLowerCase().email("Enter an email address, like ana@primolar.ph").nullable(),
});
export type SupportContact = z.infer<typeof SupportContact>;

/**
 * The PUT's body (issue 9): the same, with the phone checked like a branch's and the name cleaned. The read stays
 * SupportContact, so a contact saved before this check still shows.
 */
export const SupportContactInput = SupportContact.extend({
  name: nameText("Enter the contact's name", 120),
  phone: z.string().trim().max(PHONE_MAX, tooLong(PHONE_MAX, "the phone number")).refine(isPhoneNumber, PHONE_MESSAGE).nullable(),
});
export type SupportContactInput = z.infer<typeof SupportContactInput>;

/** GET /clinic/support (the Owner, D12, decision 21): what "Contact support" shows for this clinic's plan. */
export const ClinicSupportView = z.object({
  tier: Tier,
  channel: z.enum(["email", "chat", "contact"]),
  email: z.string().nullable(),
  chatUrl: z.string().nullable(),
  contact: SupportContact.nullable(),
});
export type ClinicSupportView = z.infer<typeof ClinicSupportView>;

/** D11: how this clinic's documents are headed. `standard` until the Owner customises (every tier's default, D4). */
export const LetterheadMode = z.enum(["standard", "text", "image"]);
export type LetterheadMode = z.infer<typeof LetterheadMode>;

/** PUT /clinic/letterhead: the Owner's choice and the text lines (the image has its own route). */
export const UpdateLetterheadInput = z.object({
  mode: LetterheadMode,
  tagline: z.string().trim().max(80, tooLong(80, "the tagline")).nullable(),
  listBranches: z.boolean(), // every open branch's address in the footer, from the branches (never retyped)
  socialLinks: z.array(z.string().trim().min(1).max(80, tooLong(80, "each link"))).max(3, "Add up to 3 links"),
  dentistLine: z.string().trim().max(120, tooLong(120, "it")).nullable(), // decision 25: free text
  footerNote: z.string().trim().max(160, tooLong(160, "the note")).nullable(),
});
export type UpdateLetterheadInput = z.infer<typeof UpdateLetterheadInput>;

/** GET /clinic/letterhead: every staff member reads it, since documents need it. */
export const LetterheadSettings = UpdateLetterheadInput.extend({
  imageUpdatedAt: IsoDateTime.nullable(), // the uploaded letterhead image, if any (GET /clinic/letterhead/image)
});
export type LetterheadSettings = z.infer<typeof LetterheadSettings>;
