import type { AgreementRecord, PrivacyChoice } from "../schemas/legal";
import type { PhotoType } from "../schemas/photo";

/** Privacy #2: every template carries this until a lawyer reviews it. */
export const PENDING_REVIEW = "Template, pending legal review";
/** Privacy #4, #5: what the lawyer fills in. */
export const COUNSEL = "[to be confirmed by counsel]";

export type LegalDocKey = "terms" | "dpa" | "privacy" | "notice" | "consent";
export type LegalSection = { heading: string; paragraphs: string[] };
export type LegalDocument = { key: LegalDocKey; title: string; version: number; date: string; sections: LegalSection[] };

/** Privacy #22, P25: Primolar's Data Protection Officer, named in the Privacy Policy. */
export const PRIMOLAR_DPO = { name: "John Ross Rivera", email: `privacy@primolar.ph ${COUNSEL}` };

const HOSTING =
  `Records are stored with reputable cloud providers, which may be outside the Philippines, under contracts that require ` +
  `protection equal to the Data Privacy Act's. Where and with whom: ${COUNSEL}.`;
const RETENTION =
  `Records are kept while the clinic subscribes, and after cancellation until the clinic asks in writing for them to be ` +
  `returned or deleted, unless a law requires a longer period. Retention period: ${COUNSEL}.`;

const CLINIC_NOTICE = [
  "{clinic} collects and uses personal information about your child and you so it can give your child dental care. This notice explains how, as the Data Privacy Act of 2012 (RA 10173) requires.",
  "What we collect: your child's name, birth date and sex; medical history, allergies and medicines; dental charts, treatment notes and X-rays; clinical photos if you agree; appointments and payments; and your name, relationship to the child, phone, email and address.",
  "Why: to examine and treat your child, keep an accurate clinical record, book visits and remind you of them, bill you, and meet our legal duties.",
  "Your choices: treatment records are needed to give care. Clinical photos and reminder messages are optional, and you can switch them on or off at any time in the parent portal or by asking us.",
  "Who sees it: our dentists and staff, each with their own login, and every access is logged. We keep our records with Primolar, a clinic software provider, which handles them only for us under a data processing agreement. We share records with others, such as a specialist or your HMO, only with your consent or when the law requires.",
  `How long we keep it: while your child is our patient, and afterwards for as long as the law on health records requires: ${COUNSEL}.`,
  "Your rights: you may ask to see, correct or get a copy of your child's records, object to a use, or complain to the National Privacy Commission. Treatment records we must keep can't be deleted on request; to withdraw your consent to them, contact us.",
  "Questions: contact our privacy contact, named below.",
];

/** Privacy #19: the Owner's starting point in Settings, and version 1 of every new clinic's notice. */
export const noticeTemplate = (clinicName: string) => CLINIC_NOTICE.map((p) => p.replaceAll("{clinic}", clinicName)).join("\n\n");

const DATE = "2026-10-13";

/** The five templates (privacy #2). Raising a version asks again: the Owner for terms and DPA (#9). */
export const LEGAL_DOCUMENTS: Record<LegalDocKey, LegalDocument> = {
  terms: {
    key: "terms",
    title: "Terms of Service",
    version: 1,
    date: DATE,
    sections: [
      { heading: "About these terms", paragraphs: ["These terms are between Primolar and the dental clinic that subscribes (\"the clinic\"). They apply from the day the clinic accepts them, online or on a signed copy."] },
      { heading: "The service", paragraphs: ["Primolar provides clinic management software as a service: patient records, appointments, billing, documents, reminders and a parent portal. Primolar may improve the service, and tells the clinic's Owner before a change that removes something the clinic relies on."] },
      { heading: "Accounts and access", paragraphs: ["The clinic's Owner manages staff logins and decides who has access. Each person uses their own login. The clinic tells Primolar at once if it suspects a login has been misused."] },
      { heading: "Fees", paragraphs: ["The clinic pays the setup fee and the first month upfront, then a monthly fee on its due date. Prices include VAT. A clinic 7 days overdue is paused until it pays; its records are kept."] },
      { heading: "The clinic's data", paragraphs: ["The clinic owns its patients' records. Primolar handles them only to provide the service, as the Data Processing Agreement sets out. That agreement is part of these terms."] },
      { heading: "Ending the subscription", paragraphs: ["Either side may end the subscription with written notice. Primolar keeps, returns or deletes the clinic's records as the Data Processing Agreement describes."] },
      { heading: "Liability", paragraphs: [`Primolar provides the service with reasonable care and skill. Clinical decisions remain the dentist's. Primolar's total liability in a year is limited to the fees the clinic paid that year: ${COUNSEL}.`] },
      { heading: "Changes", paragraphs: ["Primolar may update these terms. The clinic's Owner is asked to accept a new version at their next sign-in; other staff keep working meanwhile."] },
      { heading: "Governing law", paragraphs: [`These terms are governed by the laws of the Philippines. Venue: ${COUNSEL}.`] },
    ],
  },
  dpa: {
    key: "dpa",
    title: "Data Processing Agreement",
    version: 1,
    date: DATE,
    sections: [
      { heading: "Roles", paragraphs: ["Under the Data Privacy Act of 2012 (RA 10173) and its rules, the clinic is the personal information controller and Primolar is its personal information processor. Children's health records are sensitive personal information."] },
      { heading: "Instructions", paragraphs: ["Primolar processes patient, guardian and staff data only on the clinic's instructions, which are the clinic's use of the service, and only to provide it. Primolar never sells the data or uses it for its own marketing."] },
      { heading: "Confidentiality", paragraphs: ["Everyone at Primolar who can reach clinic data is bound to keep it confidential. Primolar's console shows clinic accounts, plans and counts, never patient records."] },
      { heading: "Security", paragraphs: [`Primolar applies organisational, physical and technical measures suited to sensitive personal information, including personal logins, access by role and a log of who opened which record. Encryption and backups: ${COUNSEL}.`] },
      { heading: "Hosting and transfers", paragraphs: [HOSTING] },
      { heading: "Subprocessors", paragraphs: ["Primolar may use subprocessors, such as hosting and message delivery, under written contracts that bind them to the same duties. Primolar tells the clinic before adding one."] },
      { heading: "Breaches", paragraphs: [`Primolar tells the clinic without undue delay after discovering a breach affecting clinic data, so the clinic can notify the National Privacy Commission and the families affected. Deadline: ${COUNSEL}.`] },
      { heading: "Helping the clinic", paragraphs: ["Primolar helps the clinic answer parents' requests to see, correct or object to the use of their data, and any inquiry from the National Privacy Commission."] },
      { heading: "Retention, return and deletion", paragraphs: [RETENTION] },
      { heading: "Checks", paragraphs: ["The clinic may ask for information showing Primolar meets this agreement, once a year or after a breach."] },
    ],
  },
  privacy: {
    key: "privacy",
    title: "Primolar Privacy Policy",
    version: 1,
    date: DATE,
    sections: [
      { heading: "Who we are", paragraphs: ["Primolar provides clinic management software to pediatric dental clinics in the Philippines. This policy covers what Primolar handles as a business: clinic sign-ups, Owners and staff logins, and payments. Patient records belong to the clinics; each clinic's own privacy notice covers them."] },
      { heading: "What we collect", paragraphs: ["Clinic details (name, TIN, address, contact email), the Owner's name and email, staff names and logins, payment records, and a log of sign-ins and of who opened which record."] },
      { heading: "Why", paragraphs: ["To set up and run each clinic's account, bill for it, keep it secure, and meet our legal duties."] },
      { heading: "Patient records", paragraphs: ["When a clinic uses Primolar, Primolar processes its patients' records only for that clinic, under a Data Processing Agreement. Parents should contact their clinic about their child's records."] },
      { heading: "Sharing", paragraphs: ["We share data only with providers that help run the service, under contracts that protect it, or when the law requires."] },
      { heading: "Hosting", paragraphs: [HOSTING] },
      { heading: "How long we keep it", paragraphs: [RETENTION] },
      { heading: "Your rights", paragraphs: ["Under the Data Privacy Act you may ask to be informed, to see and correct your data, to object, to have it blocked or erased, to get a copy you can take elsewhere, and to complain to the National Privacy Commission."] },
      { heading: "Data Protection Officer", paragraphs: [`${PRIMOLAR_DPO.name}, Primolar's Data Protection Officer: ${PRIMOLAR_DPO.email}.`] },
    ],
  },
  notice: {
    key: "notice",
    title: "Clinic privacy notice (template)",
    version: 1,
    date: DATE,
    sections: [{ heading: "Notice", paragraphs: CLINIC_NOTICE.map((p) => p.replaceAll("{clinic}", "The clinic")) }],
  },
  consent: {
    key: "consent",
    title: "Parent or guardian consent",
    version: 1,
    date: DATE,
    sections: [
      { heading: "Privacy notice", paragraphs: ["I received {clinic}'s privacy notice. It explains how the clinic collects, uses, keeps and protects my child's personal and health information, and my rights under the Data Privacy Act of 2012 (RA 10173)."] },
      { heading: "Treatment records (required)", paragraphs: ["I consent to {clinic} collecting and keeping {child}'s personal and health information to examine and treat my child, keep the clinical record and bill for care. I understand the clinic must keep these records, and that to withdraw this consent I contact the clinic."] },
      { heading: "Clinical photos (optional)", paragraphs: ["I agree that the clinic may take photos of {child}'s teeth, mouth and face for the clinical record."] },
      { heading: "Reminder messages (optional)", paragraphs: ["I agree that the clinic may send me appointment reminders, care instructions and other messages by SMS or email."] },
      { heading: "Changing my choices", paragraphs: ["I can switch the optional consents on or off at any time in the parent portal or by asking the clinic."] },
    ],
  },
};

/** Privacy #21: what every staff login acknowledges once per version. */
export const CONFIDENTIALITY_NOTICE = {
  version: 1,
  text: "Patient records are confidential; every access is logged.",
  more: "Open only the records you need for your work, never share your login, and tell the clinic's Owner if you think a record was seen by someone who shouldn't have.",
};

/** P14: the uploads the "Clinical photos" consent covers. X-rays, referrals and documents are treatment records. */
export const CONSENTED_PHOTO_TYPES: readonly PhotoType[] = ["intraoral", "extraoral"];

/** Privacy #9: no agreement, or one for an older Terms or DPA, means the Owner must accept before continuing. */
export const termsOutdated = (a: AgreementRecord | undefined) =>
  !a || a.termsVersion !== LEGAL_DOCUMENTS.terms.version || a.dpaVersion !== LEGAL_DOCUMENTS.dpa.version;

/** The optional consents in force: the newest row, or undefined when none was ever recorded. */
export const currentChoices = (p: { privacyChoices?: PrivacyChoice[] }): PrivacyChoice | undefined =>
  p.privacyChoices?.[p.privacyChoices.length - 1];

/** Privacy #14, P13: true only for an explicit "no". A child with nothing recorded is never blocked (#18). */
export const choiceDeclined = (p: { privacyChoices?: PrivacyChoice[] }, choice: "photos" | "reminders") => currentChoices(p)?.[choice] === false;
