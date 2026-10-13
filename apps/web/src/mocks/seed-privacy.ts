import {
  CONFIDENTIALITY_NOTICE,
  LEGAL_DOCUMENTS,
  noticeTemplate,
  type Acknowledgement,
  type AgreementRecord,
  type ClinicAgreement,
  type Patient,
  type PrivacyNotice,
  type StaffMember,
  type Subscription,
} from "@pedia/shared";
import type { Db } from "./db";

/** Privacy #19, P20: version 1 of a clinic's notice, from Primolar's template. The Owner is the first privacy contact. */
export function firstNotice(clinicId: string, clinicName: string, contactName: string, contactEmail: string): PrivacyNotice {
  return { clinicId, version: 1, body: noticeTemplate(clinicName), contactName, contactEmail, savedByName: "Primolar's template", at: new Date().toISOString() };
}

/** P8: seeded staff have acknowledged confidentiality already; a login the Owner adds is asked at its first sign-in. */
export const staffAcknowledged = (clinicId: string, staff: StaffMember[]): Acknowledgement[] =>
  staff.map((s) => ({ clinicId, kind: "confidentiality", version: CONFIDENTIALITY_NOTICE.version, accountId: s.id, name: s.fullName, at: new Date().toISOString() }));

/**
 * Privacy #24 (P24): the primary guardian consented on the day the child was registered, recorded by `recorder`.
 * `none`: indexes left without consent (the flag); `noPhotos`: indexes that declined clinical photos (the block).
 * No faker calls, so no other seeded record changes.
 */
export function withConsent(patients: Patient[], recorder: StaffMember, rule: { none?: number[]; noPhotos?: number[] } = {}): Patient[] {
  return patients.map((p, i) => {
    if (rule.none?.includes(i)) return p;
    const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0]!;
    return {
      ...p,
      privacyConsent: {
        guardianId: g.id,
        guardianName: g.fullName,
        relationship: g.relationship,
        noticeVersion: 1,
        formVersion: LEGAL_DOCUMENTS.consent.version,
        recordedById: recorder.id,
        recordedByName: recorder.fullName,
        at: p.createdAt,
      },
      privacyChoices: [{ photos: !rule.noPhotos?.includes(i), reminders: true, by: "staff", byName: recorder.fullName, at: p.createdAt }],
    };
  });
}

/** Privacy #7: the Get started checkbox, and the Owner's "Updated terms" page. */
export const onlineAgreement = (acceptedBy: string): AgreementRecord => ({
  termsVersion: LEGAL_DOCUMENTS.terms.version,
  dpaVersion: LEGAL_DOCUMENTS.dpa.version,
  acceptedBy,
  at: new Date().toISOString(),
  method: "online",
});

/** Privacy #8: a paper copy the operator holds, signed on `signedOn`. */
export const onFileAgreement = (acceptedBy: string, signedOn: string): AgreementRecord => ({ ...onlineAgreement(acceptedBy), method: "on_file", signedOn });

/** Privacy #11 (P6): each seeded clinic signed on file on its approval day (its subscription anchor), by its Owner. */
export const seedAgreements = (subscriptions: Subscription[], tenants: Record<string, Db>): ClinicAgreement[] =>
  subscriptions.map((s) => ({
    clinicId: s.clinicId,
    ...onFileAgreement(tenants[s.clinicId]!.staff.find((x) => x.isOwner)!.fullName, s.anchor),
    at: `${s.anchor}T10:00:00.000+08:00`,
  }));
