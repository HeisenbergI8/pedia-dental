import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { clinicNameKey, sameClinicName } from "../domain/signup";
import { CreateAppointmentRequestInput, BookAppointmentInput } from "./appointment";
import { RecordPaymentInput } from "./billing";
import { CreateChartBatchInput, CreateChartEntryInput } from "./chart";
import { AddStaffInput } from "./clinic";
import { CentavosAmount, cleanName, manilaToday, tooLong } from "./common";
import { SaveGrowthInput } from "./growth";
import { AddPlanItemInput } from "./plan";
import { CreatePatientInput, Patient, QuickUpdatePatientInput } from "./patient";
import { ConfirmReceiptInput } from "./payments";
import { UploadPhotoInput } from "./photo";
import { RecordUpfrontPaymentInput, paidOnProblem } from "./signup";
import { CreateAccountInput } from "./operator";
import { BranchInput, ClinicNameInput, SupportContact, SupportContactInput, UpdateLetterheadInput } from "./tenancy";

const messages = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};
const long = (n: number) => "a".repeat(n);

// 2026-11-19 22:00 in Manila is still 2026-11-19 14:00 UTC: "today" must be Manila's, not the machine's.
const NOW = new Date("2026-11-19T14:00:00Z");
beforeEach(() => vi.useFakeTimers({ now: NOW, toFake: ["Date"] }));
afterEach(() => vi.useRealTimers());

const child = {
  firstName: "Lucas",
  lastName: "Reyes",
  birthDate: "2019-04-02",
  sex: "male",
  guardians: [{ id: "g1", fullName: "Ana Reyes", relationship: "Mother", phone: "0917 123 4567", isPrimary: true }],
  allergies: [],
  medicalConditions: [],
  medications: [],
  alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
};

describe("manilaToday", () => {
  it("is the date in Manila (UTC+8), wherever the code runs", () => {
    expect(manilaToday(new Date("2026-11-19T15:59:59Z"))).toBe("2026-11-19");
    expect(manilaToday(new Date("2026-11-19T16:00:00Z"))).toBe("2026-11-20");
  });
});

describe("length limits (issues 5, 45)", () => {
  it("say the limit itself is allowed", () => {
    expect(tooLong(60, "the first name")).toBe("Keep the first name to 60 characters or fewer");
    expect(tooLong(1000)).toBe("Keep this to 1,000 characters or fewer");
    expect(messages(UpdateLetterheadInput.shape.tagline, long(81))).toEqual(["Keep the tagline to 80 characters or fewer"]);
    expect(UpdateLetterheadInput.shape.tagline.safeParse(long(80)).success).toBe(true);
  });

  it("cap every guardian field, the emergency contact, the previous clinic and alerts at the columns' size", () => {
    expect(CreatePatientInput.safeParse(child).success).toBe(true);
    const g = child.guardians[0]!;
    for (const guardian of [
      { ...g, fullName: long(192) },
      { ...g, relationship: long(192) },
      { ...g, email: `${long(190)}@example.com` },
      { ...g, id: long(65) },
    ])
      expect(CreatePatientInput.safeParse({ ...child, guardians: [guardian] }).success).toBe(false);
    expect(CreatePatientInput.safeParse({ ...child, emergencyContact: { name: long(192), phone: "" } }).success).toBe(false);
    expect(CreatePatientInput.safeParse({ ...child, emergencyContact: { name: "Lola", phone: "0".repeat(33) } }).success).toBe(false);
    expect(CreatePatientInput.safeParse({ ...child, dentalHistory: { previousClinic: long(192), notes: "" } }).success).toBe(false);
    expect(CreatePatientInput.safeParse({ ...child, alerts: [long(201)] }).success).toBe(false);
    expect(messages(QuickUpdatePatientInput, { nickname: undefined, tags: [], alerts: [long(201)] })).toEqual(["Keep each alert to 200 characters or fewer"]);
  });

  it("cap staff, branch and sign-up names, and the long free text", () => {
    expect(AddStaffInput.safeParse({ fullName: long(192), email: "a@b.ph", role: "dentist", branchIds: ["b"] }).success).toBe(false);
    expect(AddStaffInput.safeParse({ fullName: "Ana", email: `${long(190)}@b.ph`, role: "dentist", branchIds: ["b"] }).success).toBe(false);
    expect(AddStaffInput.safeParse({ fullName: "Ana", email: "a@b.ph", role: "dentist", branchIds: ["b"], licenseNo: long(192) }).success).toBe(false);
    const branch = { name: "Main", address: "1 Rizal St", phone: "(046) 471 2580", openingHours: { opensAt: 480, closesAt: 1020, closedWeekdays: [0] } };
    expect(BranchInput.safeParse(branch).success).toBe(true);
    for (const bad of [{ name: long(192) }, { address: long(192) }, { phone: "1".repeat(33) }]) expect(BranchInput.safeParse({ ...branch, ...bad }).success).toBe(false);
    expect(messages(ClinicNameInput, long(81))).toEqual(["Keep the clinic's name to 80 characters or fewer"]);
    expect(CreateChartEntryInput.safeParse({ visitId: "v", tooth: 74, surfaces: [], condition: "caries", note: long(2001) }).success).toBe(false);
    expect(SaveGrowthInput.safeParse({ habits: [], speech: long(2001) }).success).toBe(false);
    const booking = { patientId: "p", dentistId: "d", chairId: "c", startsAt: "2026-11-20T01:00:00.000Z", durationMin: 30, reason: long(501) };
    expect(messages(BookAppointmentInput, booking)).toEqual(["Keep the reason to 500 characters or fewer"]);
    expect(messages(UploadPhotoInput, { type: "intraoral", takenOn: "2026-11-19", caption: long(70_000) })).toEqual(["Keep the caption to 500 characters or fewer"]);
  });
});

describe("guardian phone (issue 9)", () => {
  it("takes a Philippine mobile in any common form or a landline, and refuses anything else with one message", () => {
    for (const ok of ["09171234567", "0917 123 4567", "0917.123.4567", "+63 917 123 4567", "639171234567", "0281234567", "(046) 471 2580"])
      expect(QuickUpdatePatientInput.safeParse({ phone: ok, tags: [], alerts: [] }).success).toBe(true);
    for (const bad of ["917555", "abcdefg", "<script>alert(1)</script>"])
      expect(messages(QuickUpdatePatientInput, { phone: bad, tags: [], alerts: [] })).toEqual([
        "Enter a mobile number like 0917 123 4567, or a landline like (046) 471 2580",
      ]);
  });

  it("is checked on what is typed only: a number stored before still reads", () => {
    const stored = { ...child, id: "p", clinicId: "c", patientNo: "KS-00001", consents: [], createdAt: "2026-01-01T00:00:00.000Z" };
    expect(Patient.safeParse({ ...stored, guardians: [{ ...child.guardians[0]!, phone: "917555" }] }).success).toBe(false); // min(7), as before
    expect(Patient.safeParse({ ...stored, guardians: [{ ...child.guardians[0]!, phone: "abcdefg" }] }).success).toBe(true);
  });

  it("checks the support contact's phone like a branch's, on the PUT only", () => {
    const contact = { name: "Ana", phone: "abc-not-a-phone!!", email: null };
    expect(messages(SupportContactInput, contact)).toEqual(["Enter a phone number, like (046) 471 2580 or 0917 123 4567"]);
    expect(SupportContactInput.safeParse({ ...contact, phone: "(02) 8123 4567" }).success).toBe(true);
    expect(SupportContactInput.safeParse({ ...contact, phone: null }).success).toBe(true);
    expect(SupportContact.safeParse(contact).success).toBe(true);
  });
});

describe("dates (issue 13)", () => {
  it("refuse a photo or a signed agreement after today in Manila", () => {
    expect(UploadPhotoInput.safeParse({ type: "intraoral", takenOn: "2026-11-19", caption: "" }).success).toBe(true);
    expect(messages(UploadPhotoInput, { type: "intraoral", takenOn: "2026-11-20", caption: "" })).toEqual(["The date taken can't be in the future"]);
    expect(messages(CreateAccountInput.shape.signedOn, "2026-11-20")).toEqual(["The date signed can't be in the future"]);
  });

  it("leave a payment's date to the server's clock, with one rule and message for both sides", () => {
    // The operator's demo clock may run ahead of the real date, so the schema takes any real day.
    expect(RecordUpfrontPaymentInput.safeParse({ method: "cash", paidOn: "2099-12-31" }).success).toBe(true);
    expect(ConfirmReceiptInput.safeParse({ method: "gcash", paidOn: "2099-12-31" }).success).toBe(true);
    expect(paidOnProblem("2026-11-20", "2026-11-19")).toBe("The date paid can't be in the future");
    expect(paidOnProblem("2026-11-19", "2026-11-19")).toBeUndefined();
  });

  it("take a date of birth from 1950 to today, with a message that says which is wrong", () => {
    expect(messages(CreatePatientInput, { ...child, birthDate: "1900-01-01" })).toEqual(["Check the year: the date of birth can't be before 1950"]);
    expect(messages(CreatePatientInput, { ...child, birthDate: "1899-12-31" })).toEqual(["Check the year: the date of birth can't be before 1950"]);
    expect(messages(CreatePatientInput, { ...child, birthDate: "2026-11-20" })).toEqual(["The date of birth can't be in the future"]);
    expect(CreatePatientInput.safeParse({ ...child, birthDate: "2026-11-19" }).success).toBe(true);
  });

  it("take a request date up to a year ahead", () => {
    const request = { timeOfDay: "any", reason: "Check-up" };
    expect(CreateAppointmentRequestInput.safeParse({ ...request, preferredDate: "2026-11-19" }).success).toBe(true);
    expect(CreateAppointmentRequestInput.safeParse({ ...request, preferredDate: "2027-11-19" }).success).toBe(true);
    expect(messages(CreateAppointmentRequestInput, { ...request, preferredDate: "2027-11-20" })).toEqual(["Pick a date within the next year"]);
    expect(messages(CreateAppointmentRequestInput, { ...request, preferredDate: "2099-01-01" })).toEqual(["Pick a date within the next year"]);
    // A past day is the server's refusal (requestRefusal, on its own clock), not the schema's.
  });
});

describe("amounts (issue 23)", () => {
  it("are at most ₱10,000,000 either way, below the 32-bit money columns", () => {
    expect(CentavosAmount.safeParse(1_000_000_000).success).toBe(true);
    expect(messages(CentavosAmount, 1_000_000_001)).toEqual(["Amounts can be at most ₱10,000,000"]);
    expect(CentavosAmount.safeParse(-1_000_000_001).success).toBe(false);
    expect(AddPlanItemInput.safeParse({ procedureCode: "x", fee: 2_147_483_648 }).success).toBe(false);
    expect(RecordPaymentInput.safeParse({ amount: 2_147_483_648, method: "cash", receivedBy: "s" }).success).toBe(false);
  });
});

describe("invisible characters (issue 26)", () => {
  it("are removed from names, which otherwise stay as typed", () => {
    expect(cleanName("Bot​A‮-Starter")).toBe("BotA-Starter");
    expect(cleanName("Dra. Mª Concepción")).toBe("Dra. Mª Concepción"); // NFKC would make it "Ma"
    expect(cleanName("Nin\u0303o")).toBe("Niño"); // composed (NFC)
    expect(cleanName("Niño")).toBe("Niño");
    expect(CreatePatientInput.parse({ ...child, firstName: "Lu‮cas‍" }).firstName).toBe("Lucas");
    expect(ClinicNameInput.parse("Bulilit​ Smiles")).toBe("Bulilit Smiles");
    expect(messages(ClinicNameInput, "​​")).toEqual(["Enter the clinic's name"]);
  });

  it("don't make a new clinic name for the duplicate check", () => {
    expect(clinicNameKey("BotA-Starter​ Dental")).toBe("bota-starter dental");
    expect(sameClinicName("BotA-Starter Dental", "BotA-​Starter Dental")).toBe(true);
    expect(clinicNameKey("Ｓｍｉｌｅｓ")).toBe("smiles"); // lookalikes fold in the key only
  });
});

describe("chart surfaces (issue 29)", () => {
  it("refuse the same surface twice", () => {
    expect(messages(CreateChartEntryInput, { visitId: "v", tooth: 74, surfaces: ["O", "O"], condition: "caries" })).toEqual(["A surface is picked twice"]);
    expect(CreateChartBatchInput.safeParse({ visitId: "v", teeth: [74, 75], surfaces: ["O", "O"], condition: "caries" }).success).toBe(false);
    expect(CreateChartEntryInput.safeParse({ visitId: "v", tooth: 74, surfaces: ["O", "M"], condition: "caries" }).success).toBe(true);
  });
});
