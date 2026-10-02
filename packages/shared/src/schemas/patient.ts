import { z } from "zod";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";

export const Sex = z.enum(["male", "female"]);

export const Guardian = z.object({
  id: Id,
  fullName: z.string().min(1),
  relationship: z.string().min(1), // mother, father, grandparent, legal guardian…
  phone: z.string().min(7),
  email: z.string().email().optional(),
  isPrimary: z.boolean(),
});
export type Guardian = z.infer<typeof Guardian>;

export const ConsentScope = z.enum([
  "general_treatment",
  "local_anesthesia",
  "extraction",
  "radiographs",
  "clinical_photos",
  "sedation",
]);
export type ConsentScope = z.infer<typeof ConsentScope>;

/** Who consented to what, and when. Added through its own endpoint; never edited. */
export const ConsentRecord = z.object({
  id: Id,
  guardianId: Id,
  scope: ConsentScope,
  date: IsoDate,
});
export type ConsentRecord = z.infer<typeof ConsentRecord>;

export const AddConsentInput = ConsentRecord.omit({ id: true });
export type AddConsentInput = z.infer<typeof AddConsentInput>;

export const Patient = ClinicScoped.extend({
  id: Id,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: IsoDate,
  sex: Sex,
  address: z.string().optional(),
  guardians: z.array(Guardian).min(1),
  emergencyContact: z.object({ name: z.string(), phone: z.string() }).optional(),
  allergies: z.array(z.string()),
  medicalConditions: z.array(z.string()),
  medications: z.array(z.string()),
  alerts: z.array(z.string()), // shown as a banner on every screen for this child
  dentalHistory: z.object({ previousClinic: z.string(), notes: z.string() }),
  consents: z.array(ConsentRecord),
  createdAt: IsoDateTime,
});
export type Patient = z.infer<typeof Patient>;

/** Used for both create and edit (PUT replaces the whole record except consents). */
export const CreatePatientInput = Patient.omit({ id: true, clinicId: true, createdAt: true, consents: true }).refine(
  (p) => p.guardians.filter((g) => g.isPrimary).length === 1,
  { message: "Mark exactly one guardian as primary", path: ["guardians"] },
);
export type CreatePatientInput = z.infer<typeof CreatePatientInput>;
