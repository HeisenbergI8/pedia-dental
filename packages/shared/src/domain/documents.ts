import type { DocumentType } from "../schemas/document";

export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  dental_certificate: "Dental certificate",
  treatment_plan: "Treatment plan",
  consent_form: "Consent form",
  referral_letter: "Referral letter",
  clearance: "Medical clearance request",
  post_op_instructions: "Post-operative instructions",
  prescription: "Prescription",
  receipt: "Acknowledgment receipt",
  patient_summary: "Patient summary",
};

/** Issued and signed by a dentist. A receipt or a summary can come from anyone on staff. */
export const DENTIST_SIGNED: DocumentType[] = [
  "dental_certificate",
  "treatment_plan",
  "consent_form",
  "referral_letter",
  "clearance",
  "post_op_instructions",
  "prescription",
];

/** Documents generated from one record: which kind, and the words when it's missing. */
export const DOCUMENT_SOURCE: Partial<Record<DocumentType, { kind: "visit" | "payment" | "note"; missing: string }>> = {
  dental_certificate: { kind: "visit", missing: "Pick the visit the certificate is for" },
  receipt: { kind: "payment", missing: "Pick the payment" },
  post_op_instructions: { kind: "note", missing: "Pick the signed treatment note" },
};

/** What staff add that isn't in the record, and the words when it's missing. Everything else fills from data. */
export const REQUIRED_DETAILS: Partial<Record<DocumentType, Record<string, string>>> = {
  consent_form: { scope: "Pick what the consent is for" },
  referral_letter: { referredTo: "Say who you're referring the child to", reason: "Give the reason for the referral" },
  clearance: { procedure: "Pick the planned treatment" },
};

export type Drug = {
  id: string;
  name: string;
  strength: string;
  form: string;
  /** `___` marks the dose, which the dentist must write (doses are weight-based). */
  defaultSig: string;
  defaultQuantity: string;
  /** S2 / dangerous drug: never prescribed from this app. */
  controlled: boolean;
  /** Matched against the patient's allergies, e.g. "penicillin". */
  allergyClass?: string;
};

/** The clinic's formulary, as data for the clinic to review (plan Q6). */
export const FORMULARY: Drug[] = [
  { id: "amoxicillin_250_susp", name: "Amoxicillin", strength: "250 mg/5 mL", form: "oral suspension, 60 mL", defaultSig: "Give ___ mL by mouth every 8 hours for 7 days.", defaultQuantity: "1 bottle", controlled: false, allergyClass: "penicillin" },
  { id: "paracetamol_120_syr", name: "Paracetamol", strength: "120 mg/5 mL", form: "syrup, 60 mL", defaultSig: "Give ___ mL by mouth every 4 to 6 hours as needed for pain or fever.", defaultQuantity: "1 bottle", controlled: false },
  { id: "ibuprofen_100_susp", name: "Ibuprofen", strength: "100 mg/5 mL", form: "oral suspension, 60 mL", defaultSig: "Give ___ mL by mouth every 6 to 8 hours after meals as needed for pain.", defaultQuantity: "1 bottle", controlled: false, allergyClass: "nsaid" },
  { id: "mefenamic_50_susp", name: "Mefenamic acid", strength: "50 mg/5 mL", form: "oral suspension, 60 mL", defaultSig: "Give ___ mL by mouth every 8 hours after meals as needed for pain.", defaultQuantity: "1 bottle", controlled: false, allergyClass: "nsaid" },
  { id: "chlorhexidine_012_rinse", name: "Chlorhexidine gluconate", strength: "0.12%", form: "oral rinse, 250 mL", defaultSig: "Rinse with ___ mL for 30 seconds twice a day, then spit out. Do not swallow.", defaultQuantity: "1 bottle", controlled: false },
  { id: "midazolam_2_syr", name: "Midazolam", strength: "2 mg/mL", form: "oral syrup", defaultSig: "", defaultQuantity: "", controlled: true },
  { id: "codeine_paracetamol_tab", name: "Paracetamol + codeine", strength: "300 mg/10 mg", form: "tablet", defaultSig: "", defaultQuantity: "", controlled: true },
];

export const findDrug = (id: string) => FORMULARY.find((d) => d.id === id);

/** Prescribed drugs that clash with a recorded allergy, by allergy class or drug name. */
export function allergyConflicts(allergies: string[], items: { drugId: string }[]): Drug[] {
  const recorded = allergies.map((a) => a.toLowerCase());
  return items.flatMap((i) => findDrug(i.drugId) ?? []).filter((d) =>
    recorded.some((a) => a.includes(d.name.toLowerCase()) || (!!d.allergyClass && a.includes(d.allergyClass))),
  );
}
