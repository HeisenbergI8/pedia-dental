import type { ImageRules } from "../schemas/payments";
import type { LetterheadSettings, Tier, UpdateLetterheadInput } from "../schemas/tenancy";
import { TIER_LIMITS, featureMessage } from "./tenancy";

/** D11, decision 24: PNG or JPG, at most 2 MB, drawn as a strip across the top of the page. */
export const LETTERHEAD_IMAGE_RULES: ImageRules = { maxBytes: 2 * 1024 * 1024, types: ["image/png", "image/jpeg"] };

/** Every clinic's until its Owner customises (D4, D11): documents look exactly as they always have. */
export const STANDARD_LETTERHEAD: LetterheadSettings = {
  mode: "standard", tagline: null, listBranches: false, socialLinks: [], dentistLine: null, footerNote: null, imageUpdatedAt: null,
};

/** Shown under the dentist line's field (decision 25): the signature block still names who issued each document. */
export const DENTIST_LINE_NOTE = "Each document's signature still names the dentist who issued it.";

/**
 * Why this change can't be saved, or undefined. Clinic and Pro only (D11). After a downgrade the clinic keeps what it
 * has but can't change it, and may always go back to standard (decision 22, the heading-font precedent).
 */
export function letterheadProblem(tier: Tier, input: Pick<UpdateLetterheadInput, "mode">): string | undefined {
  if (TIER_LIMITS[tier].customLetterhead || input.mode === "standard") return undefined;
  return featureMessage(tier, "customLetterhead");
}

/** The footer and header lines a text letterhead prints, in order; the branches' addresses come from the caller. */
export function letterheadLines(l: LetterheadSettings, branchLines: string[]): { header: string[]; footer: string[] } {
  if (l.mode !== "text") return { header: [], footer: [] };
  const header = [l.tagline, l.dentistLine].filter((x): x is string => !!x);
  const footer = [...(l.listBranches ? branchLines : []), l.socialLinks.join(" · "), l.footerNote ?? ""].filter((x) => x.length > 0);
  return { header, footer };
}
