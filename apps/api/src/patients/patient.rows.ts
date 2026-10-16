import { patientSearchText, type Patient } from "@pedia/shared";
import { Prisma } from "../generated/prisma/client.ts";

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A patient's own columns, the search columns included. `clinicId` is stamped by the caller (clinicData / the seed). */
export function patientColumns(p: Omit<Patient, "consents" | "privacyConsent" | "privacyChoices" | "clinicId">) {
  const search = patientSearchText(p);
  return {
    id: p.id, patientNo: p.patientNo, firstName: p.firstName, lastName: p.lastName, nickname: p.nickname ?? null,
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
