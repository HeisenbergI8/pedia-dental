import { Patient, patientSearchText } from "@pedia/shared";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.ts";
import { consentFrom, dropsConsenter, mergeEdit, patientRows, refusedTag, tidy, withStoredContacts } from "./patient.rows";
import { toPatient } from "./patient.views";

const patients = seedPlatform().tenants[DEMO_CLINIC_ID]!.patients;

describe("patientRows", () => {
  it("stores every seeded patient so that toPatient reads back exactly the same record", () => {
    for (const p of patients) {
      const rows = patientRows(p);
      const back = toPatient({
        row: {
          ...rows.patient, clinicId: p.clinicId, photoRef: null,
          tags: rows.patient.tags === Prisma.DbNull ? null : rows.patient.tags,
          profile: rows.patient.profile === Prisma.DbNull ? null : rows.patient.profile,
        } as never,
        guardians: rows.guardians.map((g) => ({ ...g, clinicId: p.clinicId })),
        consents: rows.consents.map((c) => ({ ...c, clinicId: p.clinicId })),
        privacyConsent: rows.privacyConsent && { ...rows.privacyConsent, clinicId: p.clinicId },
        choices: rows.choices.map((c, i) => ({ ...c, id: `c${i}`, clinicId: p.clinicId })),
      });
      expect(back).toEqual(Patient.parse(p));
    }
  });

  it("writes the search columns from patientSearchText", () => {
    const p = patients[0]!;
    expect(patientRows(p).patient.searchNames).toBe(patientSearchText(p).names);
    expect(patientRows(p).patient.searchPhones).toMatch(/^[\d ]+$/);
  });
});

describe("the edit rules (the mock's, as pure functions)", () => {
  const g = (id: string, phone = "09170000000") => ({ id, fullName: `Guardian ${id}`, relationship: "Mother", phone, email: `${id}@example.com`, isPrimary: id === "g1" });
  const current: Patient = Patient.parse({
    ...patients[0]!, nickname: "Bebe", address: "12 Mabini St", emergencyContact: { name: "Lola", phone: "09180000000" },
    guardians: [g("g1", "09171111111"), g("g2", "09172222222")],
    consents: [{ id: "c1", guardianId: "g2", scope: "general_treatment", date: "2026-01-02" }],
    privacyConsent: { guardianId: "g1", guardianName: "Guardian g1", relationship: "Mother", noticeVersion: 1, formVersion: 1, recordedById: "s", recordedByName: "S", at: "2026-01-02T00:00:00.000Z" },
  });
  const { id: _i, clinicId: _c, patientNo: _n, createdAt: _a, consents: _cs, privacyConsent: _pc, privacyChoices: _ch, photoUpdatedAt: _p, ...editable } = current;

  it("refuses a computed label as a tag, naming it", () => {
    expect(refusedTag(["HMO", "Balance due"])).toBe(`"Balance due" is worked out from the record, so it can't be a tag`);
    expect(refusedTag(["HMO"])).toBeUndefined();
  });

  it("tidies all-lower names", () => {
    expect(tidy({ firstName: "juan", lastName: "dela cruz" })).toEqual({ firstName: "Juan", lastName: "Dela Cruz" });
  });

  it("keeps the stored contacts for an edit sent without them, and refuses a new guardian", () => {
    const stripped = { ...editable, address: undefined, emergencyContact: undefined, guardians: current.guardians.map(({ phone: _ph, email: _e, ...x }) => x) };
    const kept = withStoredContacts(current, stripped as never)!;
    expect([kept.address, kept.emergencyContact, kept.guardians.map((x) => [x.phone, x.email])]).toEqual([
      "12 Mabini St", { name: "Lola", phone: "09180000000" }, [["09171111111", "g1@example.com"], ["09172222222", "g2@example.com"]],
    ]);
    expect(withStoredContacts(current, { ...stripped, guardians: [...stripped.guardians, { id: "g9", fullName: "New", relationship: "Aunt", isPrimary: false }] } as never)).toBeUndefined();
  });

  it("knows when an edit drops a guardian who consented", () => {
    expect(dropsConsenter(current, { guardians: [g("g1")] })).toBe(true); // g2 signed a treatment consent
    expect(dropsConsenter(current, { guardians: [g("g2")] })).toBe(true); // g1 signed the privacy consent
    expect(dropsConsenter(current, { guardians: [g("g1"), g("g2")] })).toBe(false);
  });

  it("merges an edit like the mock's spread: server fields and omitted optionals are kept", () => {
    const { nickname: _nick, ...withoutNickname } = editable;
    const next = mergeEdit(current, { ...withoutNickname, firstName: "bea" } as never);
    expect([next.patientNo, next.consents, next.nickname, next.firstName]).toEqual([current.patientNo, current.consents, "Bebe", "Bea"]);
  });

  it("records the consent with the guardian's name and relationship, or nothing for a stranger", () => {
    const input = { guardianId: "g1", confirmed: true, photos: true, reminders: false } as never;
    const r = consentFrom(current, input, { id: "staff_cruz", name: "Liza Cruz" }, 3, "2026-10-16T00:00:00.000Z")!;
    expect([r.privacyConsent.guardianName, r.privacyConsent.relationship, r.privacyConsent.noticeVersion, r.privacyConsent.recordedById]).toEqual(["Guardian g1", "Mother", 3, "staff_cruz"]);
    expect(r.choice).toEqual({ photos: true, reminders: false, by: "staff", byName: "Liza Cruz", at: "2026-10-16T00:00:00.000Z" });
    expect(consentFrom(current, { ...(input as object), guardianId: "nobody" } as never, { id: "s", name: "S" }, 1, "x")).toBeUndefined();
  });
});
