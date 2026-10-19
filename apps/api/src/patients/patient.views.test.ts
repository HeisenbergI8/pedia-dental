import { PatientView, type Role } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { toPatient, toSummary, visibleTo, type PatientRecord, type Viewer } from "./patient.views";

const at = new Date("2026-10-01T02:00:00.000Z");
const record: PatientRecord = {
  row: {
    id: "p1", clinicId: "c1", patientNo: "KS-00001", firstName: "Bea", lastName: "Mendoza", nickname: null,
    birthDate: new Date("2019-04-12T00:00:00.000Z"), sex: "female", address: "12 Mabini St",
    emergencyName: "Lola", emergencyPhone: "0918 000 0000", allergies: [], noKnownAllergies: true, medicalConditions: [],
    medications: [], noKnownConditions: true, alerts: [], tags: ["HMO"], dentalHistory: { previousClinic: "", notes: "" },
    profile: null, photoRef: null, photoUpdatedAt: null, createdAt: at, searchNames: "", searchPhones: "", restrictedAt: null,
  },
  guardians: [{
    clinicId: "c1", patientId: "p1", guardianId: "g1", fullName: "Rosa Mendoza", relationship: "Mother",
    phone: "09171234567", email: "rosa@example.com", isPrimary: true, position: 0,
  }],
  consents: [],
  choices: [{ id: "x", clinicId: "c1", patientId: "p1", position: 0, photos: true, reminders: true, by: "staff", byName: "Front desk", at }],
};

describe("visibleTo (CONVENTIONS → Contact data)", () => {
  const p = toPatient(record);
  const as = (roles: Role[], children: string[] = []): Viewer => ({ userId: "u", name: "U", roles, children: new Set(children) });

  it("gives front desk and admin every contact field", () => {
    for (const roles of [["front_desk"], ["admin"]] as Role[][]) expect(visibleTo(as(roles), p)).toEqual(PatientView.parse(p));
  });
  it("gives a dentist no guardian phone, email, emergency contact or address", () => {
    expect(JSON.stringify(visibleTo(as(["dentist"]), p))).not.toMatch(/0917|Mabini|example\.com|Lola/);
  });
  it("gives a parent their own child's contacts and nobody else's", () => {
    expect(visibleTo(as(["parent"], [p.id]), p).guardians[0]!.phone).toBe("09171234567");
    expect(visibleTo(as(["parent"], ["someone_else"]), p).guardians[0]!.phone).toBeUndefined();
  });
  it("never changes the stored record", () => {
    visibleTo(as(["dentist"]), p);
    expect(p.address).toBe("12 Mabini St");
  });
  it("reads dates as calendar days and leaves absent things absent", () => {
    expect(p.birthDate).toBe("2019-04-12");
    expect(toPatient({ ...record, choices: [] }).privacyChoices).toBeUndefined();
    expect(toPatient({ ...record, row: { ...record.row, tags: null } }).tags).toBeUndefined();
  });
});

describe("toSummary", () => {
  const p = toPatient(record);
  const desk: Viewer = { userId: "u", name: "U", roles: ["front_desk"], children: new Set() };

  const none = { balance: 0, flags: { recallDue: false, balanceDue: false, noContact: false } };

  it("carries the last visit and recall days when there are some, and leaves them absent when there aren't", () => {
    const due = { ...none, lastVisitOn: "2026-06-02", recallDueOn: "2026-06-05", flags: { ...none.flags, recallDue: true } };
    expect(toSummary(desk, p, [], false, due)).toMatchObject({ lastVisitOn: "2026-06-02", recallDueOn: "2026-06-05", flags: { recallDue: true } });
    const bare = toSummary(desk, p, [], false, none);
    expect(bare).not.toHaveProperty("lastVisitOn");
    expect(bare).not.toHaveProperty("recallDueOn");
  });

  it("shows the balance only with billing.view", () => {
    expect(toSummary(desk, p, [], true, none).balance).toBe(0);
    expect(toSummary(desk, p, [], false, none)).not.toHaveProperty("balance");
  });
});

describe("toPatient (B13c2b)", () => {
  it("carries the restriction to whoever may still read the record", () => {
    expect(toPatient({ ...record, row: { ...record.row, restrictedAt: at } }).restrictedAt).toBe(at.toISOString());
    expect(toPatient(record).restrictedAt).toBeUndefined();
  });
});
