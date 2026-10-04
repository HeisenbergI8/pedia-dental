import type { Patient, PatientProfile } from "../schemas/patient";

export const formatPatientNo = (n: number) => `KS-${String(n).padStart(5, "0")}`;

/** One more than the highest number in use, so a gap (a deleted test record) is never refilled. */
export function nextPatientNo(existing: Pick<Patient, "patientNo">[]): string {
  const max = existing.reduce((m, p) => Math.max(m, Number(p.patientNo.slice(3)) || 0), 0);
  return formatPatientNo(max + 1);
}

/** For comparing, never for display: accents, case, hyphens and extra spaces don't make a different name. */
export const sameText = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s-]+/g, " ").trim();

/** Kept lower case inside a name ("Maria de los Angeles"), but capitalised when they start it ("Dela Cruz"). */
const PARTICLES = new Set(["de", "del", "dela", "della", "delos", "la", "las", "los", "y", "van", "von", "da", "di", "san", "sta"]);
const capital = (w: string) => w.replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());

/**
 * Tidies a typed name. All-lower or ALL-CAPS input is title-cased; anything already in mixed case is the
 * family's own spelling ("McArthur", "dela Cruz", "DeLeon") and is kept, only trimmed.
 */
export function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  const mixed = name !== name.toLowerCase() && name !== name.toUpperCase();
  if (mixed || !name) return name;
  return name
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : capital(w)))
    .join(" ");
}

/** Same child? Same birth date and the same first and last name, ignoring case, accents and spacing. */
export function findDuplicates<T extends Pick<Patient, "firstName" | "lastName" | "birthDate">>(
  candidate: Pick<Patient, "firstName" | "lastName" | "birthDate">,
  patients: T[],
): T[] {
  const key = (p: Pick<Patient, "firstName" | "lastName" | "birthDate">) =>
    `${sameText(p.firstName)}|${sameText(p.lastName)}|${p.birthDate}`;
  return patients.filter((p) => key(p) === key(candidate));
}

/** Suggestions only: staff may type their own. Never one of the patient list's computed labels. */
export const TAG_SUGGESTIONS = ["Anxious", "Special needs", "Needs sedation", "Orthodontic case", "HMO", "Prefers Filipino", "Sibling discount"];
/** Computed from the record (domain/patient-list.ts); a stored tag with the same words would contradict it. */
export const COMPUTED_LABELS = ["Recall due", "Balance due", "No contact"];
export const isReservedTag = (tag: string) => COMPUTED_LABELS.some((l) => sameText(l) === sameText(tag));

export const PROFILE_LABEL: Record<keyof PatientProfile, string> = {
  school: "School",
  hmo: "HMO / insurance",
  bloodType: "Blood type",
  familyDoctor: "Family doctor",
  referredBy: "Referred by",
  diet: "Diet",
  brushing: "Brushing habits",
  badDentalExperience: "Bad past dental experience",
  fluorideHistory: "Fluoride history",
};

/** Only the details that were filled in, in display order. Never a list of "None recorded". */
export function filledProfile(profile: PatientProfile | undefined): { key: keyof PatientProfile; label: string; value: string }[] {
  return (Object.keys(PROFILE_LABEL) as (keyof PatientProfile)[]).flatMap((key) => {
    const value = profile?.[key]?.trim();
    return value ? [{ key, label: PROFILE_LABEL[key], value }] : [];
  });
}
