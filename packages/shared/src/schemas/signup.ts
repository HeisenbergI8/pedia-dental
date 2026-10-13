import { z } from "zod";
import { PaymentMethod } from "./billing";
import { AddStaffInput } from "./clinic";
import { Centavos, Id, IsoDateTime, isoDate } from "./common";
import { AgreementRecord } from "./legal";
import { BranchInput, ClinicAccount, HeadingFont, HexColor, Tier } from "./tenancy";

/** Billing #6: how the clinic will look on day one. */
export const BrandingChoice = z.enum(["own", "default", "designed"]);
export type BrandingChoice = z.infer<typeof BrandingChoice>;
export const BRANDING_CHOICE_LABEL: Record<BrandingChoice, string> = {
  own: "Use my own",
  default: "Use the default look",
  designed: "Design it for me",
};

/**
 * The branding part of a sign-up (billing #6, #9). `own` carries one colour (checked by brandColorProblem in the form
 * and the handler, billing #19) and a font from the shortlist or null for Primolar's (#20). The logo and the reference
 * images are files: they travel beside this JSON as multipart parts `logo` and `reference`, never inside it.
 */
export const BrandingInput = z.discriminatedUnion("choice", [
  z.object({ choice: z.literal("own"), brandColor: HexColor, headingFont: HeadingFont.nullable() }),
  z.object({ choice: z.literal("default") }),
  z.object({
    choice: z.literal("designed"),
    brief: z
      .string()
      .trim()
      .min(1, "Tell us the feel you want, and any colours you like or don't")
      .max(1000, "Keep the brief under 1,000 characters"),
  }),
]);
export type BrandingInput = z.infer<typeof BrandingInput>;

/**
 * POST /signups (billing #5): the clinic, its first branch, its Owner, the plan and the branding choice. Further
 * branches and staff are the Owner's, after sign-in. The Owner is an Admin or a Dentist, never Front desk (#58).
 */
export const SignupInput = z.object({
  account: ClinicAccount.pick({ name: true, contactEmail: true, tin: true, tier: true }),
  branch: BranchInput,
  owner: AddStaffInput.pick({ fullName: true, email: true }).extend({ role: z.enum(["admin", "dentist"]) }),
  branding: BrandingInput,
});
export type SignupInput = z.infer<typeof SignupInput>;

/** POST /signups (privacy #7, P4): the public form also needs the unticked acceptance. The console's Fix keeps SignupInput. */
export const GetStartedInput = SignupInput.extend({
  acceptTerms: z.literal(true, { error: "Tick the box to accept the Terms of Service and the Data Processing Agreement" }),
});
export type GetStartedInput = z.infer<typeof GetStartedInput>;

/** One plan's prices, VAT-inclusive centavos (billing #22, #23). */
export const PlanPrice = z.object({ setupFee: Centavos.nonnegative(), monthlyFee: Centavos.nonnegative() });
export type PlanPrice = z.infer<typeof PlanPrice>;

/** GET /signups/prices, GET and PUT /operator/prices: the operator's price list (billing #23). */
export const PriceList = z.object({
  plans: z.object({ small: PlanPrice, mid: PlanPrice, big: PlanPrice }),
  designAddOn: Centavos.nonnegative(), // the same on every plan
});
export type PriceList = z.infer<typeof PriceList>;

/** What a sign-up pays upfront (billing #24), quoted when it is submitted (A2). `vat` is the part of `total` that is VAT. */
export const AmountDue = z.object({
  setupFee: Centavos,
  firstMonth: Centavos,
  designAddOn: Centavos, // 0 unless Design it for me
  total: Centavos,
  vat: Centavos,
});
export type AmountDue = z.infer<typeof AmountDue>;

/** How the upfront payment arrived. Marked by hand in the prototype (billing #3); never account credit. */
export const UpfrontMethod = PaymentMethod.exclude(["account_credit"]);
export type UpfrontMethod = z.infer<typeof UpfrontMethod>;

/** POST /operator/signups/:id/payment, and part of a direct creation: the whole quoted total, in one payment (A4). */
export const RecordUpfrontPaymentInput = z.object({
  method: UpfrontMethod,
  reference: z.string().trim().max(60, "Keep the reference under 60 characters").optional(),
  paidOn: isoDate("Enter the date it was paid"),
});
export type RecordUpfrontPaymentInput = z.infer<typeof RecordUpfrontPaymentInput>;

/** The recorded payment. Chunk 23's payment history starts from this shape. */
export const UpfrontPayment = RecordUpfrontPaymentInput.extend({ amount: Centavos.nonnegative(), recordedAt: IsoDateTime });
export type UpfrontPayment = z.infer<typeof UpfrontPayment>;

/** Billing #17: a Design it for me clinic goes live with the default look, then gets its finished branding. */
export const DesignStatus = z.enum(["in_progress", "delivered"]);
export type DesignStatus = z.infer<typeof DesignStatus>;
export const DESIGN_STATUS_LABEL: Record<DesignStatus, string> = { in_progress: "Design in progress", delivered: "Delivered" };

/** A3. Paid or not is `payment`, so "Paid, ready to approve" and "Rejected, refunded" are labels, not states. */
export const SignupStatus = z.enum(["waiting", "approved", "rejected"]);
export type SignupStatus = z.infer<typeof SignupStatus>;

/**
 * One sign-up, as the operator sees it (billing #12–#17). Stored in `Platform.signups`, outside every tenant. A direct
 * creation in the console writes one too, `source: "console"`, already paid and approved (A5).
 */
export const Signup = SignupInput.extend({
  id: Id,
  reference: z.string().regex(/^PRM-[A-Z0-9]{4}-[A-Z0-9]{4}$/), // what the client keeps to check on it (A1)
  source: z.enum(["form", "console"]),
  submittedAt: IsoDateTime,
  logoRef: z.string().optional(), // blob key; `own` only
  referenceRefs: z.array(z.string()).max(3), // blob keys; `designed` only
  quote: AmountDue,
  payment: UpfrontPayment.optional(),
  status: SignupStatus,
  rejection: z.object({ reason: z.string(), at: IsoDateTime }).optional(),
  approval: z.object({ clinicId: Id, at: IsoDateTime }).optional(),
  design: z.object({ status: DesignStatus, deliveredAt: IsoDateTime.optional() }).optional(), // `designed` only
  agreement: AgreementRecord, // privacy #7, #8: carried to the clinic on approval (Platform.agreements)
});
export type Signup = z.infer<typeof Signup>;

/**
 * GET /signups/:reference and the POST /signups answer: what the client may see about their own sign-up (A1). Strict,
 * so the Owner's email, the TIN, the brief or a file key can't leak to anyone holding a reference.
 */
export const SignupStatusView = z.strictObject({
  reference: z.string(),
  clinicName: z.string(),
  tier: Tier,
  branding: BrandingChoice,
  quote: AmountDue,
  status: SignupStatus,
  paid: z.boolean(),
  rejectionReason: z.string().nullable(),
});
export type SignupStatusView = z.infer<typeof SignupStatusView>;

/** POST /operator/signups/:id/reject (billing #13): the reason is shown to the client as written. */
export const RejectSignupInput = z.object({
  reason: z.string().trim().min(1, "Tell the clinic why").max(500, "Keep the reason under 500 characters"),
});
export type RejectSignupInput = z.infer<typeof RejectSignupInput>;

/** PUT /operator/accounts/:id/branding (billing #17, #19, #20): the finished design. The logo is the `logo` part. */
export const SetBrandingInput = z.object({ brandColor: HexColor, headingFont: HeadingFont });
export type SetBrandingInput = z.infer<typeof SetBrandingInput>;
