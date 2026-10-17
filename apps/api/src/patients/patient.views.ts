import { DuplicateMatch, Patient, PatientSummary, PatientView, permissionScopeFor, type Permission, type Role } from "@pedia/shared";
import type { ClinicIdentity } from "../auth/identity.service";
import type { Standing } from "./patient-standing";
import type {
  Patient as PatientRow, PatientConsent, PatientGuardian, PatientPrivacyConsent, PrivacyChoice,
} from "../generated/prisma/client.ts";

/** Who is looking: what visibleTo and the lists decide by. A parent's children come from the guard (decision 5). */
export type Viewer = {
  userId: string;
  name: string;
  roles: readonly Role[];
  staffId?: string;
  guardianId?: string;
  children: ReadonlySet<string>;
};

export const viewerOf = (who: ClinicIdentity): Viewer => ({
  userId: who.user.id, name: who.user.name, roles: who.user.roles, staffId: who.staffId, guardianId: who.guardianId,
  children: who.children ?? new Set(),
});

/** The mock's `inScope` (access.ts:100): held at `all`, or at `own` for one of this parent's children. */
export function inScope(viewer: Viewer, permission: Permission, patientId: string): boolean {
  const scope = permissionScopeFor(viewer.roles, permission);
  return scope === "all" || (scope === "own" && viewer.children.has(patientId));
}

/** Everything one patient is stored as. Guardians and choices in any order: sorted here. */
export type PatientRecord = {
  row: PatientRow;
  guardians: PatientGuardian[];
  consents: PatientConsent[];
  privacyConsent?: PatientPrivacyConsent;
  choices: PrivacyChoice[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/** The stored record as the contract's `Patient`. Parsed, so a bad Json column fails here, not in the browser. */
export function toPatient({ row, guardians, consents, privacyConsent, choices }: PatientRecord): Patient {
  return Patient.parse({
    id: row.id,
    clinicId: row.clinicId,
    patientNo: row.patientNo,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname ?? undefined,
    birthDate: day(row.birthDate),
    sex: row.sex,
    address: row.address ?? undefined,
    emergencyContact: row.emergencyName !== null && row.emergencyPhone !== null ? { name: row.emergencyName, phone: row.emergencyPhone } : undefined,
    guardians: [...guardians]
      .sort((a, b) => a.position - b.position)
      .map((g) => ({ id: g.guardianId, fullName: g.fullName, relationship: g.relationship, phone: g.phone, email: g.email ?? undefined, isPrimary: g.isPrimary })),
    allergies: row.allergies,
    noKnownAllergies: row.noKnownAllergies ?? undefined,
    medicalConditions: row.medicalConditions,
    medications: row.medications,
    noKnownConditions: row.noKnownConditions ?? undefined,
    alerts: row.alerts,
    tags: row.tags ?? undefined,
    dentalHistory: row.dentalHistory,
    profile: row.profile ?? undefined,
    photoUpdatedAt: row.photoUpdatedAt?.toISOString(),
    consents: [...consents]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => ({ id: c.id, guardianId: c.guardianId, scope: c.scope, date: day(c.date) })),
    privacyConsent: privacyConsent && {
      guardianId: privacyConsent.guardianId, guardianName: privacyConsent.guardianName, relationship: privacyConsent.relationship,
      noticeVersion: privacyConsent.noticeVersion, formVersion: privacyConsent.formVersion,
      recordedById: privacyConsent.recordedById, recordedByName: privacyConsent.recordedByName, at: privacyConsent.at.toISOString(),
    },
    // Absent, not [], for a child registered before chunk 24 (the mock's shape; #18).
    privacyChoices: choices.length
      ? [...choices].sort((a, b) => a.position - b.position).map((c) => ({ photos: c.photos, reminders: c.reminders, by: c.by, byName: c.byName, at: c.at.toISOString() }))
      : undefined,
    createdAt: row.createdAt.toISOString(),
  });
}

/**
 * A patient as this viewer may see them (the mock's visibleTo, mocks.ts:79): guardian phones and emails, the emergency
 * contact and the address only with patients.contact (front desk, admin; a parent for their own children).
 */
export function visibleTo(viewer: Viewer, p: Patient): PatientView {
  if (inScope(viewer, "patients.contact", p.id)) return PatientView.parse(p);
  return PatientView.parse({
    ...p,
    address: undefined,
    emergencyContact: undefined,
    guardians: p.guardians.map(({ phone: _phone, email: _email, ...g }) => g),
  });
}

/** GET /patient-duplicates: id, number, names and birth date. Never guardians or phones (mocks.ts:300). */
export const toDuplicate = ({ id, patientNo, firstName, lastName, birthDate }: Patient): DuplicateMatch =>
  DuplicateMatch.parse({ id, patientNo, firstName, lastName, birthDate });

/** One row of GET /patient-summaries: last visit, recall and balance from B5/B7/B8 (standingPage); noContact waits for B9. */
export function toSummary(viewer: Viewer, p: Patient, siblings: string[], money: boolean, s: Pick<Standing, "lastVisitOn" | "recallDueOn" | "balance" | "flags">): PatientSummary {
  const g = p.guardians.find((x) => x.isPrimary) ?? p.guardians[0]!;
  return PatientSummary.parse({
    id: p.id, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate,
    allergies: p.allergies, medicalConditions: p.medicalConditions, alerts: p.alerts,
    guardianName: g.fullName,
    ...(inScope(viewer, "patients.contact", p.id) && { guardianPhone: g.phone }),
    siblings,
    ...(s.lastVisitOn && { lastVisitOn: s.lastVisitOn }),
    ...(money && { balance: s.balance }),
    ...(s.recallDueOn && { recallDueOn: s.recallDueOn }),
    flags: s.flags,
  });
}
