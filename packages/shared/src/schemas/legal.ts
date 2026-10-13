import { z } from "zod";
import { Id, IsoDate, IsoDateTime } from "./common";

const Version = z.number().int().positive();

/**
 * A clinic's acceptance of Primolar's Terms of Service and Data Processing Agreement (privacy #7, #8, #23): which
 * versions, who, when, and how. `online`: the Get started checkbox or the Owner's "Updated terms" page. `on_file`: a
 * signed paper copy the operator holds, with the date it was signed.
 */
export const AgreementRecord = z.object({
  termsVersion: Version,
  dpaVersion: Version,
  acceptedBy: z.string().min(1),
  at: IsoDateTime,
  method: z.enum(["online", "on_file"]),
  signedOn: IsoDate.optional(),
});
export type AgreementRecord = z.infer<typeof AgreementRecord>;

/** One row of `Platform.agreements`: append-only, the newest per clinic is the one in force (P6). */
export const ClinicAgreement = AgreementRecord.extend({ clinicId: Id });
export type ClinicAgreement = z.infer<typeof ClinicAgreement>;

/**
 * The parent's required consent (privacy #12, #16, #17): which guardian, as they were named then, against which
 * notice and form versions, and who recorded it. Recorded once; withdrawing it is handled outside the app (#15).
 */
export const PrivacyConsent = z.object({
  guardianId: Id,
  guardianName: z.string(),
  relationship: z.string(),
  noticeVersion: Version,
  formVersion: Version,
  recordedById: Id,
  recordedByName: z.string(),
  at: IsoDateTime,
});
export type PrivacyConsent = z.infer<typeof PrivacyConsent>;

/** One state of the two optional consents (#13–#15). Append-only on the patient; the newest row is in force. */
export const PrivacyChoice = z.object({
  photos: z.boolean(),
  reminders: z.boolean(),
  by: z.enum(["staff", "parent"]),
  byName: z.string(),
  at: IsoDateTime,
});
export type PrivacyChoice = z.infer<typeof PrivacyChoice>;

/** POST /patients/:id/privacy-choices: staff or the parent switch the optional consents. */
export const PrivacyChoicesInput = PrivacyChoice.pick({ photos: true, reminders: true });
export type PrivacyChoicesInput = z.infer<typeof PrivacyChoicesInput>;

/**
 * POST /patients/:id/privacy-choices: only what changed. The server merges it onto the choices on record, so a screen
 * holding an older copy can never send back a "yes" the family has since withdrawn.
 */
export const ChangePrivacyChoicesInput = PrivacyChoicesInput.partial().refine((c) => c.photos !== undefined || c.reminders !== undefined, {
  message: "Say which consent changes",
});
export type ChangePrivacyChoicesInput = z.infer<typeof ChangePrivacyChoicesInput>;

/** The consent step of registration, and POST /patients/:id/privacy-consent for a child registered before chunk 24. */
export const RecordPrivacyConsentInput = PrivacyChoicesInput.extend({
  guardianId: z.string().min(1, "Choose the guardian who consented"),
  confirmed: z.literal(true, { error: "Tick to confirm the guardian received the privacy notice and consented" }),
});
export type RecordPrivacyConsentInput = z.infer<typeof RecordPrivacyConsentInput>;

/** One saved version of a clinic's privacy notice (#19, #22). Append-only per clinic; the newest is in force. */
export const PrivacyNotice = z.object({
  clinicId: Id,
  version: Version,
  body: z.string().trim().min(1, "Write the notice, or start from Primolar's template").max(8000, "Keep the notice under 8,000 characters"),
  contactName: z.string().trim().min(1, "Name the clinic's privacy contact"),
  contactEmail: z.string().trim().toLowerCase().email("Enter the privacy contact's email, like privacy@clinic.ph"),
  savedByName: z.string(),
  at: IsoDateTime,
});
export type PrivacyNotice = z.infer<typeof PrivacyNotice>;

/** PUT /clinic/privacy-notice: what the Owner edits. Saving makes a new version (#19). */
export const SavePrivacyNoticeInput = PrivacyNotice.pick({ body: true, contactName: true, contactEmail: true });
export type SavePrivacyNoticeInput = z.infer<typeof SavePrivacyNoticeInput>;

/** GET /clinic/privacy-notice and the public GET /legal/notices/:clinicId. */
export const PrivacyNoticeView = PrivacyNotice.omit({ clinicId: true }).extend({ clinicName: z.string() });
export type PrivacyNoticeView = z.infer<typeof PrivacyNoticeView>;

/** What a sign-in may have to clear first (P10), in this order: the Owner's terms, staff confidentiality, a parent's notice. */
export const AcknowledgementKind = z.enum(["terms", "confidentiality", "notice"]);
export type AcknowledgementKind = z.infer<typeof AcknowledgementKind>;

/** One login's acknowledgement of a version (#20, #21, #23). Terms acceptances are `ClinicAgreement`s instead. */
export const Acknowledgement = z.object({
  clinicId: Id,
  kind: z.enum(["confidentiality", "notice"]),
  version: Version,
  accountId: Id,
  name: z.string(),
  at: IsoDateTime,
});
export type Acknowledgement = z.infer<typeof Acknowledgement>;

/** POST /auth/acknowledgement. The version must be the one waiting, so a stale page can't accept an old text. */
export const AcknowledgeInput = z.object({ kind: AcknowledgementKind, version: Version });
export type AcknowledgeInput = z.infer<typeof AcknowledgeInput>;

/** GET /auth/acknowledgement: the page to show. `children`: a parent's own children and their consents on record (#20). */
export const AcknowledgementPrompt = z.object({
  kind: AcknowledgementKind,
  version: Version,
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  clinicName: z.string(),
  contact: z.object({ name: z.string(), email: z.string() }).optional(),
  children: z
    .array(z.object({ firstName: z.string(), recorded: z.boolean(), photos: z.boolean().optional(), reminders: z.boolean().optional() }))
    .optional(),
});
export type AcknowledgementPrompt = z.infer<typeof AcknowledgementPrompt>;
