import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";
import { DOCUMENT_SOURCE, REQUIRED_DETAILS, findDrug } from "../domain/documents";

/** Feature 13's documents. */
export const DocumentType = z.enum([
  "dental_certificate",
  "treatment_plan",
  "consent_form",
  "referral_letter",
  "clearance",
  "dental_clearance",
  "post_op_instructions",
  "prescription",
  "receipt",
  "patient_summary",
  "notes_report",
]);
export type DocumentType = z.infer<typeof DocumentType>;

export const PrescriptionItem = z.object({
  drugId: z.string().min(1, "Choose a medicine"),
  sig: z.string().trim().min(1, "Write how to take it").refine((s) => !s.includes("___"), "Write the dose where it says ___"),
  quantity: z.string().trim().min(1, "Enter how much to dispense"),
});
export type PrescriptionItem = z.infer<typeof PrescriptionItem>;

/** One generated document, logged on the patient record. Append-only; the PDF itself isn't stored. */
export const PatientDocument = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  type: DocumentType,
  title: z.string(),
  /** The visit (certificate), payment (receipt) or signed note (post-op) it was generated from. */
  sourceId: Id.optional(),
  /** What staff chose that isn't in the record: consent scope, referral recipient, planned treatment. */
  details: z.record(z.string(), z.string()).optional(),
  items: z.array(PrescriptionItem).optional(),
  issuedBy: Id,
  createdAt: IsoDateTime,
});
export type PatientDocument = z.infer<typeof PatientDocument>;

export const GenerateDocumentInput = PatientDocument.pick({ type: true, sourceId: true, details: true, items: true, issuedBy: true }).superRefine((d, ctx) => {
  const source = DOCUMENT_SOURCE[d.type];
  if (source && !d.sourceId) ctx.addIssue({ code: "custom", message: source.missing, path: ["sourceId"] });
  for (const [key, message] of Object.entries(REQUIRED_DETAILS[d.type] ?? {})) {
    if (!d.details?.[key]?.trim()) ctx.addIssue({ code: "custom", message, path: ["details", key] });
  }
  if (d.type !== "prescription") return;
  if (!d.items?.length) ctx.addIssue({ code: "custom", message: "Add at least one medicine", path: ["items"] });
  d.items?.forEach((item, i) => {
    const drug = findDrug(item.drugId);
    if (!drug) ctx.addIssue({ code: "custom", message: "That medicine isn't in the clinic's formulary", path: ["items", i, "drugId"] });
    else if (drug.controlled) {
      ctx.addIssue({ code: "custom", message: `${drug.name} is a controlled (S2) drug and can't be prescribed here`, path: ["items", i, "drugId"] });
    }
  });
});
export type GenerateDocumentInput = z.infer<typeof GenerateDocumentInput>;
