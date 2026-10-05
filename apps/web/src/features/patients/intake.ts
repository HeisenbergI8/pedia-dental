/** The relationships offered as chips; anything else is "Other" with its own words. */
export const RELATIONSHIPS = ["Mother", "Father", "Grandparent"] as const;

/** Which chip a stored relationship shows as: one of the three, "Other" (with the text), or "" when blank. */
export const relationshipChoice = (r: string) =>
  r.trim() === "" ? "" : (RELATIONSHIPS.find((x) => x.toLowerCase() === r.trim().toLowerCase()) ?? "Other");

/** Stored "09171234567" is shown after a fixed +63 as "9171234567"; "0917…", "917…", "+63 917…" all store "0917…". */
export const phoneAfterPrefix = (stored: string) => stored.replace(/\D/g, "").replace(/^(63|0)/, "");
export const storedPhone = (typed: string) => {
  const digits = phoneAfterPrefix(typed);
  return digits ? `0${digits}` : "";
};

/** "Ana Maria Cruz" → first "Ana Maria", last "Cruz"; one word is a first name. */
export function splitName(q: string) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? { firstName: words.slice(0, -1).join(" "), lastName: words[words.length - 1] } : { firstName: words[0] ?? "", lastName: "" };
}

type MedicalLists = { allergies: string[]; noKnownAllergies?: boolean; medicalConditions: string[]; medications: string[]; noKnownConditions?: boolean };

/** An older record with listed allergies was evidently asked: show "Has allergies" rather than demanding an answer. */
export function withMedicalAnswers<T extends MedicalLists>(p: T): T {
  return {
    ...p,
    noKnownAllergies: p.noKnownAllergies ?? (p.allergies.length ? false : undefined),
    noKnownConditions: p.noKnownConditions ?? (p.medicalConditions.length + p.medications.length ? false : undefined),
  };
}

type IntakeValues = {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  sex?: string;
  guardians?: { fullName?: string; relationship?: string; phone?: string }[];
  noKnownAllergies?: boolean;
  noKnownConditions?: boolean;
};

/** The three required sections, done or not, for the progress rail. `contacts`: false when the editor can't see phones. */
export function requiredProgress(v: IntakeValues, contacts: boolean) {
  const g = v.guardians?.[0];
  return {
    child: !!(v.firstName?.trim() && v.lastName?.trim() && v.birthDate && v.sex),
    guardian: !!(g?.fullName?.trim() && g.relationship?.trim() && (!contacts || g.phone)),
    medical: v.noKnownAllergies !== undefined && v.noKnownConditions !== undefined,
  };
}
