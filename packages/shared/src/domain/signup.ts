import type { AmountDue, BrandingChoice, PriceList, Signup } from "../schemas/signup";
import type { Tier } from "../schemas/tenancy";
import { cleanName } from "../schemas/common";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { TIER_LIMITS } from "./tenancy";

/** Billing #22: every price includes 12% VAT. */
export const VAT_RATE = 0.12;

/** The VAT inside a VAT-inclusive amount, to the centavo: 12/112 of it. */
export const vatPart = (inclusive: number) => Math.round((inclusive * VAT_RATE) / (1 + VAT_RATE));

/** Billing #24: setup fee + first month (+ the design add-on), in one payment, quoted from today's price list (A2). */
export function amountDue(prices: PriceList, tier: Tier, choice: BrandingChoice): AmountDue {
  const { setupFee, monthlyFee } = prices.plans[tier];
  // Feature 16 (revised): Pro includes Design it for me.
  const designAddOn = choice === "designed" && !TIER_LIMITS[tier].designIncluded ? prices.designAddOn : 0;
  const total = setupFee + monthlyFee + designAddOn;
  return { setupFee, firstMonth: monthlyFee, designAddOn, total, vat: vatPart(total) };
}

/**
 * "Bulilit  Smiles " and "bulilit smiles" are one clinic: spaces collapsed, case ignored (platform #63, billing #10), and
 * invisible characters removed and lookalikes folded (cleanName, issue 26), so a hidden zero-width space is no new name. */
export const clinicNameKey = (name: string) => cleanName(name).normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export const sameClinicName = (a: string, b: string) => clinicNameKey(a) === clinicNameKey(b);

/** Billing #10, word for word the same in the form and the API. */
const DUPLICATE_NAME_TAIL = "is already on Primolar or waiting to join. Contact Primolar if it's yours.";
export const duplicateNameMessage = (name: string) => `A clinic called ${name.trim()} ${DUPLICATE_NAME_TAIL}`;
export const DUPLICATE_EMAIL_MESSAGE =
  "That contact email already belongs to a clinic on Primolar or one waiting to join. Contact Primolar if it's yours.";

/** The field a duplicate refusal is about, so a form can show it there; undefined for any other refusal. */
export function duplicateField(message: string): "account.name" | "account.contactEmail" | undefined {
  if (message === DUPLICATE_EMAIL_MESSAGE) return "account.contactEmail";
  if (message.startsWith("A clinic called ") && message.endsWith(DUPLICATE_NAME_TAIL)) return "account.name";
  return undefined;
}

/**
 * What the console and the client call a sign-up's state (A3, billing #14). Takes a stored `Signup` (paid = has a
 * `payment`) or the client's `SignupStatusView` (which says `paid`).
 */
export function signupStatusLabel(s: Pick<Signup, "status"> & { payment?: unknown; paid?: boolean }): string {
  const paid = s.paid ?? !!s.payment;
  if (s.status === "approved") return "Approved";
  if (s.status === "rejected") return paid ? "Rejected, refunded" : "Rejected";
  return paid ? "Paid, ready to approve" : "Waiting for setup fee";
}

/** A7: Design it for me takes up to three examples of looks they like. Photos, so bigger than a logo. */
export const REFERENCE_IMAGE_RULES = { max: 3, maxBytes: 5 * 1024 * 1024, types: ["image/png", "image/jpeg"] };

/** Why these files can't be the reference images, in plain words. Undefined when they can. */
export function referenceImagesProblem(files: { type: string; size: number }[]): string | undefined {
  if (files.length > REFERENCE_IMAGE_RULES.max) return `Choose up to ${REFERENCE_IMAGE_RULES.max} reference images`;
  if (files.some((f) => !REFERENCE_IMAGE_RULES.types.includes(f.type))) return "Reference images must be PNG or JPG files";
  if (files.some((f) => f.size > REFERENCE_IMAGE_RULES.maxBytes)) return "Each reference image must be 5 MB or smaller";
  return undefined;
}

/** B12 decision 14: sign-ups per hour from one connection, counted before the form is read. */
export const SIGNUPS_PER_HOUR = 5;
export const SIGNUP_LIMIT_MESSAGE = "Too many sign-ups from this connection. Try again in an hour.";

/** B12 decision 15: a rejected sign-up's files are deleted this many days after the rejection; the record stays. */
export const REJECTED_FILES_DAYS = 30;

/** A timestamp's Manila calendar day (UTC+8, no DST). */
const manilaDay = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);

/** Is this sign-up's files' time up on `today` (a Manila date)? */
export function filesDueForDeletion(s: Pick<Signup, "status" | "rejection" | "filesDeletedAt">, today: string): boolean {
  if (s.status !== "rejected" || !s.rejection || s.filesDeletedAt) return false;
  return differenceInCalendarDays(parseISO(today), parseISO(manilaDay(s.rejection.at))) >= REJECTED_FILES_DAYS;
}

/**
 * #17: a waiting sign-up with no setup fee recorded is rejected this many days after it was submitted (the nightly job;
 * the mock's once-a-day run), so unpaid sign-ups don't pile up or hold names. Its files then go 30 days later, as any
 * rejected sign-up's. One waiting for the operator to check a receipt is left alone until the receipt is answered.
 */
export const UNPAID_SIGNUP_DAYS = 14;
export const UNPAID_SIGNUP_REASON = `Not paid within ${UNPAID_SIGNUP_DAYS} days`;

/** Is this sign-up unpaid past its time on `today` (a Manila date)? The caller checks for a receipt waiting. */
export function unpaidSignupExpired(s: Pick<Signup, "status" | "payment" | "submittedAt">, today: string): boolean {
  if (s.status !== "waiting" || s.payment) return false;
  return differenceInCalendarDays(parseISO(today), parseISO(manilaDay(s.submittedAt))) >= UNPAID_SIGNUP_DAYS;
}

/**
 * #29: what the public form says about any clash it can't safely name, so the form never tells a stranger which clinic
 * or email is on Primolar. The operator's console keeps the real reason (`duplicateNameMessage`, `DUPLICATE_EMAIL_MESSAGE`).
 * The email's own words stay only for a resubmission of the same waiting sign-up (its name and email both match).
 */
export const SIGNUP_REFUSED_MESSAGE = "We couldn't take this sign-up. If your clinic already uses Primolar, contact us.";

/** #29: the public form's 409 for a clash. `ownSignup`: the same name and email as a waiting sign-up (a resubmission). */
export const publicClashMessage = (ownSignup: boolean) => (ownSignup ? DUPLICATE_EMAIL_MESSAGE : SIGNUP_REFUSED_MESSAGE);
