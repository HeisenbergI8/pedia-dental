import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDate, IsoDateTime, isoDate } from "./common";

export const Sex = z.enum(["male", "female"]);

export const Guardian = z.object({
  id: Id,
  fullName: z.string().trim().min(1, "Enter the guardian's full name"),
  relationship: z.string().trim().min(1, "Say how they're related, e.g. Mother"), // mother, father, grandparent, legal guardian…
  phone: z.string().min(7, "Enter the guardian's phone number, like 0917 123 4567"),
  email: z.string().email("Enter a valid email address, like name@example.com").optional(),
  isPrimary: z.boolean(),
});
export type Guardian = z.infer<typeof Guardian>;

/**
 * A guardian as the API returns them. `phone` and `email` reach only callers holding patients.contact (front desk,
 * admin; a parent for their own children). The stored Guardian always has a phone.
 */
export const GuardianView = Guardian.extend({ phone: Guardian.shape.phone.optional() });
export type GuardianView = z.infer<typeof GuardianView>;

export const ConsentScope = z.enum([
  "general_treatment",
  "local_anesthesia",
  "extraction",
  "radiographs",
  "clinical_photos",
  "sedation",
  "data_privacy",
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

/** The clinic's own chart number, assigned by the server on create. Never reused. */
export const PatientNo = z.string().regex(/^KS-\d{5}$/, "A patient number looks like KS-00042");

/** A short admin label ("Anxious", "HMO"). Not clinical: clinical facts go in `alerts`, shown in the banner. */
export const PatientTag = z.string().trim().min(1, "Type a tag").max(24, "Keep a tag under 24 characters");

export const BloodType = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
export type BloodType = z.infer<typeof BloodType>;

const detail = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).optional();

/** Optional background. Empty ones are never shown (see filledProfile). */
export const PatientProfile = z.object({
  school: detail(120),
  hmo: detail(120), // provider and member number, e.g. "Maxicare · 1234-5678-90"
  bloodType: BloodType.optional(),
  familyDoctor: detail(120),
  referredBy: detail(120),
  diet: detail(300),
  brushing: detail(300),
  badDentalExperience: detail(300),
  fluorideHistory: detail(300),
});
export type PatientProfile = z.infer<typeof PatientProfile>;

export const Patient = ClinicScoped.extend({
  id: Id,
  patientNo: PatientNo,
  firstName: z.string().trim().min(1, "Enter the child's first name"),
  lastName: z.string().trim().min(1, "Enter the child's last name"),
  /** What the child is called, shown next to the name: Lucas "Luke" Reyes. */
  nickname: z.string().trim().max(30, "Keep the nickname under 30 characters").optional(),
  birthDate: isoDate("Enter the date of birth"),
  sex: Sex,
  address: z.string().optional(),
  guardians: z.array(Guardian).min(1, "Add at least one guardian"),
  emergencyContact: z.object({ name: z.string(), phone: z.string() }).optional(),
  allergies: z.array(z.string()),
  medicalConditions: z.array(z.string()),
  medications: z.array(z.string()),
  alerts: z.array(z.string()), // shown as a banner on every screen for this child
  tags: z.array(PatientTag).max(8, "Up to 8 tags").optional(),
  dentalHistory: z.object({ previousClinic: z.string(), notes: z.string() }),
  profile: PatientProfile.optional(),
  /** Set by the server when the child has a photo; also busts the <img> cache after a change. */
  photoUpdatedAt: IsoDateTime.optional(),
  consents: z.array(ConsentRecord),
  createdAt: IsoDateTime,
});
export type Patient = z.infer<typeof Patient>;

/**
 * A patient as the API returns them. Without patients.contact, guardian phones and emails, the emergency contact and
 * the address are left out (they are already optional on Patient; only the guardian phone needed loosening). The same
 * shape as PatientSummary.guardianPhone and PatientHeaderSummary's money: present only with the permission.
 */
export const PatientView = Patient.extend({ guardians: z.array(GuardianView).min(1, "Add at least one guardian") });
export type PatientView = z.infer<typeof PatientView>;

/** Case-insensitive, so "anxious" and "Anxious" count as one tag. */
const uniqueTags = (tags: string[] | undefined) => new Set((tags ?? []).map((t) => t.trim().toLowerCase())).size === (tags ?? []).length;
const onePrimary = (p: { guardians: { isPrimary: boolean }[] }) => p.guardians.filter((g) => g.isPrimary).length === 1;
const PRIMARY_RULE = { message: "Mark exactly one guardian as primary", path: ["guardians"] };
const TAG_RULE = { message: "That tag is already there", path: ["tags"] };

// Unrefined, because zod 4 refuses .omit() on a refined object (the edit input below omits from it).
const PatientInputBase = Patient.omit({
  id: true,
  clinicId: true,
  createdAt: true,
  consents: true,
  patientNo: true, // server-assigned
  photoUpdatedAt: true, // set by the photo endpoints
});

/** Used for create, and for edit by a caller holding patients.contact (PUT replaces the whole record except consents). */
export const CreatePatientInput = PatientInputBase.refine(onePrimary, PRIMARY_RULE).refine((p) => uniqueTags(p.tags), TAG_RULE);
export type CreatePatientInput = z.infer<typeof CreatePatientInput>;

/**
 * PUT /patients/:id from a caller without patients.contact (a dentist). They were never sent the contacts, so the
 * input has none: the server keeps the stored guardian phones and emails, emergency contact and address, and refuses
 * a guardian it doesn't already have (a new guardian needs a phone). Anything extra in the body is stripped.
 */
export const EditPatientWithoutContactsInput = PatientInputBase.omit({ address: true, emergencyContact: true })
  .extend({ guardians: z.array(Guardian.omit({ phone: true, email: true })).min(1, "Add at least one guardian") })
  .refine(onePrimary, PRIMARY_RULE)
  .refine((p) => uniqueTags(p.tags), TAG_RULE);
export type EditPatientWithoutContactsInput = z.infer<typeof EditPatientWithoutContactsInput>;

/**
 * "Quick update" (PATCH /patients/:id): the four things front desk changes most, without the full form.
 * `phone` is the primary guardian's (a child has no phone of their own). It is optional because only
 * `patients.contact` may send it; the handler refuses it from anyone else.
 */
export const QuickUpdatePatientInput = z
  .object({
    phone: Guardian.shape.phone.optional(),
    nickname: Patient.shape.nickname,
    tags: z.array(PatientTag).max(8, "Up to 8 tags"),
    alerts: z.array(z.string().trim().min(1)),
  })
  .refine((p) => uniqueTags(p.tags), { message: "That tag is already there", path: ["tags"] });
export type QuickUpdatePatientInput = z.infer<typeof QuickUpdatePatientInput>;

/**
 * The pinned header's facts, computed by the server in one request. Money fields are left out for a caller
 * without billing.view. Balance and credit are computed from payments, never stored.
 * (Not the patient list's `PatientSummary` row, schemas/patient-list.ts.)
 */
export const PatientHeaderSummary = z.object({
  patientId: Id,
  patientNo: PatientNo,
  lastVisitOn: IsoDate.optional(),
  balance: Centavos.optional(),
  credit: Centavos.optional(),
  /** Children sharing a guardian phone, computed by the server so phones never reach the header. */
  siblings: z.array(z.object({ id: Id, firstName: z.string() })),
});
export type PatientHeaderSummary = z.infer<typeof PatientHeaderSummary>;

/** A possible duplicate found before creating a patient (same normalised name and birth date). Never contacts. */
export const DuplicateMatch = Patient.pick({ id: true, patientNo: true, firstName: true, lastName: true, birthDate: true });
export type DuplicateMatch = z.infer<typeof DuplicateMatch>;
