import { Patient, patientSearchText } from "@pedia/shared";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.ts";
import { patientRows } from "./patient.rows";
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
