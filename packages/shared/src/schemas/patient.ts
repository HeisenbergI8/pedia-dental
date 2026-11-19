import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDate, IsoDateTime, TEXT_COLUMN_MAX, calendarDay, cleanName, isoDate, manilaToday, nameText, tooLong } from "./common";
import { PHONE_MAX, isPhoneNumber } from "./tenancy";
import { smsNumber } from "../domain/sending";
import { PrivacyChoice, PrivacyConsent, RecordPrivacyConsentInput } from "./legal";

export const Sex = z.enum(["male", "female"], { error: "Choose the child's sex" });

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
 * A guardian's phone as typed (issue 9): a Philippine mobile (smsNumber), or a landline by the branch phone rule. A
 * landline stays allowed (B11: its family can't be invited, and its texts fail as "No phone number"). Inputs only: a
 * number stored before this check is still read.
 */
export const GuardianPhone = z
  .string()
  .trim()
  .min(1, "Enter the guardian's phone number, like 0917 123 4567")
  .max(PHONE_MAX, tooLong(PHONE_MAX, "the phone number"))
  .refine((p) => smsNumber(p) !== undefined || isPhoneNumber(p), "Enter a mobile number like 0917 123 4567, or a landline like (046) 471 2580");

/** A guardian as typed (issue 5: at most the columns' size; issue 26: names cleaned). */
export const GuardianInput = Guardian.extend({
  id: Id.max(64),
  fullName: nameText("Enter the guardian's full name", TEXT_COLUMN_MAX, "the guardian's name"),
  relationship: Guardian.shape.relationship.max(TEXT_COLUMN_MAX, tooLong(TEXT_COLUMN_MAX, "the relationship")),
  phone: GuardianPhone,
  email: z.string().trim().email("Enter a valid email address, like name@example.com").max(TEXT_COLUMN_MAX, tooLong(TEXT_COLUMN_MAX, "the email address")).optional(),
});
export type GuardianInput = z.infer<typeof GuardianInput>;

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
export const PatientTag = z.string().trim().min(1, "Type a tag").max(24, tooLong(24, "a tag"));

export const BloodType = z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
export type BloodType = z.infer<typeof BloodType>;

const detail = (max: number) => z.string().trim().max(max, tooLong(max)).optional();

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

/** The longest first or last name of a child (audit #4). */
export const PATIENT_NAME_MAX = 60;
/** The earliest date of birth taken (issue 13): earlier is a typing mistake at a children's clinic. */
export const EARLIEST_BIRTH_DATE = "1950-01-01";
/**
 * Issue 13: a photo's date taken and a habit's dates can't be before the child was born. Checked by the server against
 * the stored birth date (the API and the mock), so the schema stays per-record.
 */
export const BEFORE_BIRTH = "The date can't be before the child was born";
export const beforeBirthProblem = (date: string | undefined, birthDate: string): string | undefined =>
  date && date < birthDate ? BEFORE_BIRTH : undefined;
/** Free text kept as long text (a note, a list item): a sensible cap well inside the column (issue 5). */
export const NOTE_MAX = 2000;
export const ALERT_MAX = 200;
/** Issue 5: a home address, typed (the column is TEXT; 66,000 characters was a 500). */
export const ADDRESS_MAX = 500;

export const Patient = ClinicScoped.extend({
  id: Id,
  patientNo: PatientNo,
  firstName: z.string().trim().min(1, "Enter the child's first name"),
  lastName: z.string().trim().min(1, "Enter the child's last name"),
  /** What the child is called, shown next to the name: Lucas "Luke" Reyes. */
  nickname: z.string().trim().max(30, tooLong(30, "the nickname")).optional(),
  birthDate: isoDate("Enter the date of birth").refine((d) => d <= manilaToday(), "The date of birth can't be in the future"),
  sex: Sex,
  address: z.string().optional(),
  guardians: z.array(Guardian).min(1, "Add at least one guardian"),
  emergencyContact: z.object({ name: z.string(), phone: z.string() }).optional(),
  allergies: z.array(z.string()),
  /** Asked at intake. undefined: never asked (older records); true: none known; false: the list above. */
  noKnownAllergies: z.boolean().optional(),
  medicalConditions: z.array(z.string()),
  medications: z.array(z.string()),
  /** The same answer for conditions and medications together. */
  noKnownConditions: z.boolean().optional(),
  alerts: z.array(z.string()), // shown as a banner on every screen for this child
  tags: z.array(PatientTag).max(8, "Up to 8 tags").optional(),
  dentalHistory: z.object({ previousClinic: z.string(), notes: z.string() }),
  profile: PatientProfile.optional(),
  /** Set by the server when the child has a photo; also busts the <img> cache after a change. */
  photoUpdatedAt: IsoDateTime.optional(),
  consents: z.array(ConsentRecord),
  /** Privacy #12: the parent's required consent. Absent for children registered before chunk 24 (#18, never a block). */
  privacyConsent: PrivacyConsent.optional(),
  /** Privacy #13–#15: the optional consents, append-only, newest last (`currentChoices`). */
  privacyChoices: z.array(PrivacyChoice).optional(),
  /** B13c2b E6: set when an erasure request was approved. Only the Owner and admins (privacy.manage) still read the record. */
  restrictedAt: IsoDateTime.optional(),
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

type MedicalAnswers = Pick<Patient, "allergies" | "noKnownAllergies" | "medicalConditions" | "medications" | "noKnownConditions">;
/** "None known" with a list, or "has some" with none, contradicts itself. Unanswered is allowed (older records, the API). */
const answersAgree = (p: MedicalAnswers, ctx: z.RefinementCtx) => {
  const agree = (answer: boolean | undefined, count: number) => answer === undefined || answer === (count === 0);
  if (!agree(p.noKnownAllergies, p.allergies.length))
    ctx.addIssue({ code: "custom", path: ["allergies"], message: p.noKnownAllergies ? "Remove the allergies, or choose Has allergies" : "Add the allergy, or choose None known" });
  if (!agree(p.noKnownConditions, p.medicalConditions.length + p.medications.length))
    ctx.addIssue({
      code: "custom",
      path: ["medicalConditions"],
      message: p.noKnownConditions ? "Remove the conditions and medicines, or choose Has some" : "Add a condition or medicine, or choose None known",
    });
};

/** One alert as typed (the banner on every screen): at most ALERT_MAX characters. */
const AlertText = z.string().trim().max(ALERT_MAX, tooLong(ALERT_MAX, "each alert"));

// Unrefined, because zod 4 refuses .omit() on a refined object (the edit input below omits from it).
const PatientInputBase = Patient.omit({
  id: true,
  clinicId: true,
  createdAt: true,
  consents: true,
  privacyConsent: true, // set by POST /patients and the privacy routes, never by an edit
  privacyChoices: true,
  patientNo: true, // server-assigned
  photoUpdatedAt: true, // set by the photo endpoints
  restrictedAt: true, // set only by closing an erasure request (B13c2b)
}).extend({
  // Audit #4: names typed now go into invite texts, so they are capped; stored names are read as they are.
  // Issue 26: invisible characters removed and lookalikes folded.
  firstName: nameText("Enter the child's first name", PATIENT_NAME_MAX, "the first name"),
  lastName: nameText("Enter the child's last name", PATIENT_NAME_MAX, "the last name"),
  nickname: z.string().overwrite(cleanName).trim().max(30, tooLong(30, "the nickname")).optional(),
  address: z.string().trim().max(ADDRESS_MAX, tooLong(ADDRESS_MAX, "the address")).optional(),
  // Issue 13: not in the future (Manila) and not before EARLIEST_BIRTH_DATE, each with its own message.
  birthDate: calendarDay("Enter the date of birth")
    .refine((d) => d >= EARLIEST_BIRTH_DATE, `Check the year: the date of birth can't be before ${EARLIEST_BIRTH_DATE.slice(0, 4)}`)
    .refine((d) => d <= manilaToday(), "The date of birth can't be in the future"),
  // Issue 5: typed text capped at the columns' size, or a sensible length for long text. Stored rows are read as they are.
  guardians: z.array(GuardianInput).min(1, "Add at least one guardian"),
  emergencyContact: z
    .object({
      name: z.string().overwrite(cleanName).trim().max(TEXT_COLUMN_MAX, tooLong(TEXT_COLUMN_MAX, "the name")),
      phone: z.string().trim().max(PHONE_MAX, tooLong(PHONE_MAX, "the phone number")),
    })
    .optional(),
  alerts: z.array(AlertText),
  dentalHistory: z.object({
    previousClinic: z.string().max(TEXT_COLUMN_MAX, tooLong(TEXT_COLUMN_MAX, "the clinic's name")),
    notes: z.string().max(NOTE_MAX, tooLong(NOTE_MAX, "the notes")),
  }),
});

/** Used for create, and for edit by a caller holding patients.contact (PUT replaces the whole record except consents). */
export const CreatePatientInput = PatientInputBase.refine(onePrimary, PRIMARY_RULE)
  .refine((p) => uniqueTags(p.tags), TAG_RULE)
  .superRefine(answersAgree);
export type CreatePatientInput = z.infer<typeof CreatePatientInput>;

/**
 * POST /patients (privacy #12, P12): the child plus the parent's consent. No child is saved without it. The guardian
 * who consented is one of the guardians being registered; the server copies their name and relationship.
 */
export const RegisterPatientInput = PatientInputBase.extend({ privacyConsent: RecordPrivacyConsentInput })
  .refine(onePrimary, PRIMARY_RULE)
  .refine((p) => uniqueTags(p.tags), TAG_RULE)
  .superRefine(answersAgree)
  .refine((p) => p.guardians.some((g) => g.id === p.privacyConsent.guardianId), {
    message: "Choose one of this child's guardians",
    path: ["privacyConsent", "guardianId"],
  });
export type RegisterPatientInput = z.infer<typeof RegisterPatientInput>;

/**
 * PUT /patients/:id from a caller without patients.contact (a dentist). They were never sent the contacts, so the
 * input has none: the server keeps the stored guardian phones and emails, emergency contact and address, and refuses
 * a guardian it doesn't already have (a new guardian needs a phone). Anything extra in the body is stripped.
 */
export const EditPatientWithoutContactsInput = PatientInputBase.omit({ address: true, emergencyContact: true })
  .extend({ guardians: z.array(GuardianInput.omit({ phone: true, email: true })).min(1, "Add at least one guardian") })
  .refine(onePrimary, PRIMARY_RULE)
  .refine((p) => uniqueTags(p.tags), TAG_RULE)
  .superRefine(answersAgree);
export type EditPatientWithoutContactsInput = z.infer<typeof EditPatientWithoutContactsInput>;

/**
 * "Quick update" (PATCH /patients/:id): the four things front desk changes most, without the full form.
 * `phone` is the primary guardian's (a child has no phone of their own). It is optional because only
 * `patients.contact` may send it; the handler refuses it from anyone else.
 */
export const QuickUpdatePatientInput = z
  .object({
    phone: GuardianPhone.optional(),
    nickname: PatientInputBase.shape.nickname,
    tags: z.array(PatientTag).max(8, "Up to 8 tags"),
    alerts: z.array(AlertText.min(1)),
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
