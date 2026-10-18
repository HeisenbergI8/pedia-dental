import type { AmountDue, BrandingChoice, PriceList, Signup } from "../schemas/signup";
import type { Tier } from "../schemas/tenancy";
import { differenceInCalendarDays, parseISO } from "date-fns";

/** Billing #22: every price includes 12% VAT. */
export const VAT_RATE = 0.12;

/** The VAT inside a VAT-inclusive amount, to the centavo: 12/112 of it. */
export const vatPart = (inclusive: number) => Math.round((inclusive * VAT_RATE) / (1 + VAT_RATE));

/** Billing #24: setup fee + first month (+ the design add-on), in one payment, quoted from today's price list (A2). */
export function amountDue(prices: PriceList, tier: Tier, choice: BrandingChoice): AmountDue {
  const { setupFee, monthlyFee } = prices.plans[tier];
  const designAddOn = choice === "designed" ? prices.designAddOn : 0;
  const total = setupFee + monthlyFee + designAddOn;
  return { setupFee, firstMonth: monthlyFee, designAddOn, total, vat: vatPart(total) };
}

/** "Bulilit  Smiles " and "bulilit smiles" are one clinic: spaces collapsed, case ignored (platform #63, billing #10). */
export const clinicNameKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();
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

/** Is this sign-up's files' time up on `today` (a Manila date)? */
export function filesDueForDeletion(s: Pick<Signup, "status" | "rejection" | "filesDeletedAt">, today: string): boolean {
  if (s.status !== "rejected" || !s.rejection || s.filesDeletedAt) return false;
  const rejectedOn = new Date(Date.parse(s.rejection.at) + 8 * 3_600_000).toISOString().slice(0, 10); // Manila: UTC+8, no DST
  return differenceInCalendarDays(parseISO(today), parseISO(rejectedOn)) >= REJECTED_FILES_DAYS;
}
