import {
  LEGAL_DOCUMENTS, isReservedTag, normalizeName, patientSearchText,
  type CreatePatientInput, type EditPatientWithoutContactsInput, type Patient, type PrivacyConsent, type RecordPrivacyConsentInput,
} from "@pedia/shared";
import { Prisma } from "../generated/prisma/client.ts";

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * A patient's own columns, the search columns included. `clinicId` is stamped by the caller (clinicData / the seed).
 * Without an `id`, Prisma's cuid(2) default chooses one (POST /patients).
 */
export function patientColumns(p: Omit<Patient, "consents" | "privacyConsent" | "privacyChoices" | "clinicId" | "id"> & { id?: string }) {
  const search = patientSearchText(p);
  return {
    ...(p.id && { id: p.id }), patientNo: p.patientNo, firstName: p.firstName, lastName: p.lastName, nickname: p.nickname ?? null,
    birthDate: dateOnly(p.birthDate), sex: p.sex, address: p.address ?? null,
    emergencyName: p.emergencyContact?.name ?? null, emergencyPhone: p.emergencyContact?.phone ?? null,
    allergies: p.allergies, noKnownAllergies: p.noKnownAllergies ?? null, medicalConditions: p.medicalConditions,
    medications: p.medications, noKnownConditions: p.noKnownConditions ?? null, alerts: p.alerts,
    tags: p.tags ?? Prisma.DbNull, dentalHistory: p.dentalHistory, profile: p.profile ?? Prisma.DbNull,
    photoUpdatedAt: p.photoUpdatedAt ? new Date(p.photoUpdatedAt) : null,
    createdAt: new Date(p.createdAt),
    searchNames: search.names, searchPhones: search.digits,
  };
}

/** One child's guardian rows, in the record's order. */
export const guardianRows = (patientId: string, guardians: Patient["guardians"]) =>
  guardians.map((g, position) => ({
    patientId, guardianId: g.id, fullName: g.fullName, relationship: g.relationship, phone: g.phone, email: g.email ?? null,
    isPrimary: g.isPrimary, position,
  }));

/** Everything a contract `Patient` is stored as (the seed writes these; POST writes the same through its own pieces). */
export function patientRows(p: Patient) {
  return {
    patient: patientColumns(p),
    guardians: guardianRows(p.id, p.guardians),
    consents: p.consents.map((c) => ({ id: c.id, patientId: p.id, guardianId: c.guardianId, scope: c.scope, date: dateOnly(c.date), createdAt: new Date(p.createdAt) })),
    privacyConsent: p.privacyConsent && { ...p.privacyConsent, patientId: p.id, at: new Date(p.privacyConsent.at) },
    choices: (p.privacyChoices ?? []).map((c, position) => ({ ...c, patientId: p.id, position, at: new Date(c.at) })),
  };
}

/** The mock's 400 for a computed label used as a tag (mocks.ts:69), or undefined. */
export const refusedTag = (tags: string[] | undefined): string | undefined => {
  const tag = tags?.find(isReservedTag);
  return tag && `"${tag}" is worked out from the record, so it can't be a tag`;
};

/** Names are stored tidied (mocks.ts:63). */
export const tidy = <T extends { firstName: string; lastName: string }>(p: T): T => ({ ...p, firstName: normalizeName(p.firstName), lastName: normalizeName(p.lastName) });

/**
 * A caller without patients.contact edits a record they were sent without contacts (mocks.ts:195): the stored address,
 * emergency contact and guardian phones and emails are kept. A guardian not already on the record needs a phone, so it
 * is refused: `undefined` here, the mock's 403 in the service.
 */
export function withStoredContacts(current: Patient, input: EditPatientWithoutContactsInput): CreatePatientInput | undefined {
  const stored = new Map(current.guardians.map((g) => [g.id, g]));
  if (input.guardians.some((g) => !stored.has(g.id))) return undefined;
  return {
    ...input,
    address: current.address,
    emergencyContact: current.emergencyContact,
    guardians: input.guardians.map((g) => ({ ...g, phone: stored.get(g.id)!.phone, email: stored.get(g.id)!.email })),
  };
}

/** True when the edit drops a guardian who signed a treatment consent or the privacy consent (the mock's 409). */
export function dropsConsenter(current: Patient, input: Pick<CreatePatientInput, "guardians">): boolean {
  const kept = new Set(input.guardians.map((g) => g.id));
  const consenter = current.privacyConsent?.guardianId;
  return current.consents.some((c) => !kept.has(c.guardianId)) || (!!consenter && !kept.has(consenter));
}

/**
 * PUT's result (mocks.ts:219): `{ ...current, ...tidy(input) }`. A key the parsed input lacks keeps its stored value,
 * exactly as the mock's spread (so omitting `nickname` doesn't clear it). Server fields (patientNo, photoUpdatedAt,
 * consents, createdAt) are never in the input, so they are kept.
 */
export const mergeEdit = (current: Patient, input: CreatePatientInput): Patient => ({ ...current, ...tidy(input) });

/** Privacy #12, #16, #17 (mocks.ts:45): the consent as recorded, or undefined when the guardian isn't this child's. */
export function consentFrom(
  p: Pick<Patient, "guardians">, input: RecordPrivacyConsentInput,
  recorder: { id: string; name: string }, noticeVersion: number, at: string,
): { privacyConsent: PrivacyConsent; choice: { photos: boolean; reminders: boolean; by: "staff"; byName: string; at: string } } | undefined {
  const g = p.guardians.find((x) => x.id === input.guardianId);
  if (!g) return undefined;
  return {
    privacyConsent: {
      guardianId: g.id, guardianName: g.fullName, relationship: g.relationship, noticeVersion,
      formVersion: LEGAL_DOCUMENTS.consent.version, recordedById: recorder.id, recordedByName: recorder.name, at,
    },
    choice: { photos: input.photos, reminders: input.reminders, by: "staff", byName: recorder.name, at },
  };
}
