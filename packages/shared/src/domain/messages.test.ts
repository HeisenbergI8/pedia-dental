import { describe, expect, it } from "vitest";
import { MessageTemplate } from "../schemas/message";
import { birthdayGreeting, composeMessage, isBirthdayOn, messageVars, preVisitMessageFor, renderMessage, reminderSendAt, unknownPlaceholders } from "./messages";

const bea = { firstName: "Bea", lastName: "Mendoza", guardians: [{ id: "g1", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }] };
const startsAt = new Date(2030, 0, 8, 10, 30).toISOString(); // Tue Jan 8 2030, 10:30 AM local

describe("parent messages", () => {
  it("fills the child's name, date and time for a booking", () => {
    const body = "Hi {guardian_name}, {child_first_name} is booked {date} at {time} with {dentist_name}.";
    expect(renderMessage(body, messageVars(bea, { clinicName: "Bulilit Smiles", startsAt, dentistName: "Dr. Ana Reyes" }))).toBe(
      "Hi Rosa Mendoza, Bea is booked Tue, Jan 8 at 10:30 AM with Dr. Ana Reyes.",
    );
  });

  it("names the clinic account it is given", () => {
    expect(renderMessage("See you at {clinic_name}", messageVars(bea, { clinicName: "Ngiti Kids Dental" }))).toBe("See you at Ngiti Kids Dental");
  });

  it("leaves a placeholder with no value visible, rather than dropping it", () => {
    expect(renderMessage("{child_first_name} is due {date} at {time}", messageVars(bea, { clinicName: "Bulilit Smiles", dueOn: "2030-01-08" }))).toBe(
      "Bea is due Tue, Jan 8 at {time}",
    );
  });

  it("refuses a template with a misspelled placeholder", () => {
    expect(unknownPlaceholders("Hi {child_nmae}, see you {date}")).toEqual(["child_nmae"]);
    const template = { clinicId: "c", kind: "recall", name: "Recall", body: "Hi {child_nmae}", updatedAt: new Date().toISOString() };
    expect(MessageTemplate.safeParse(template).success).toBe(false);
    expect(MessageTemplate.safeParse({ ...template, body: "Hi {child_first_name}" }).success).toBe(true);
  });

  it("sends the reminder at 9 AM the day before, or now when booked later than that", () => {
    expect(reminderSendAt(startsAt, new Date(2030, 0, 1))).toBe(new Date(2030, 0, 7, 9, 0).toISOString());
    const late = new Date(2030, 0, 7, 15, 0);
    expect(reminderSendAt(startsAt, late)).toBe(late.toISOString());
  });
});

describe("birthday rule (shared by the daily job and Send greeting)", () => {
  it("matches month and day only", () => {
    expect(isBirthdayOn("2019-10-03", "2026-10-03")).toBe(true);
    expect(isBirthdayOn("2019-10-04", "2026-10-03")).toBe(false);
  });
  it("finds this year's greeting, not last year's", () => {
    const m = (createdAt: string) => ({ patientId: "p", kind: "birthday" as const, createdAt });
    expect(birthdayGreeting([m("2025-10-03T01:00:00.000Z")], "p", "2026-10-03")).toBeUndefined();
    expect(birthdayGreeting([m("2026-10-03T01:00:00.000Z")], "p", "2026-10-03")).toBeDefined();
  });
});

describe("pre-treatment instructions", () => {
  it("go with an extraction or a pulpotomy booking, not a checkup", () => {
    expect(preVisitMessageFor("extraction")).toBe("pre_treatment");
    expect(preVisitMessageFor("pulpotomy")).toBe("pre_treatment");
    expect(preVisitMessageFor("oral_exam")).toBeUndefined();
    expect(preVisitMessageFor(undefined)).toBeUndefined();
  });
});

describe("composeMessage", () => {
  const patient = { id: "p1", clinicId: "c1", ...bea } as unknown as Parameters<typeof composeMessage>[1]["patients"][number];
  const refs = { templates: [{ kind: "birthday" as const, body: "Happy birthday, {child_first_name}!" }], patients: [patient], staff: [], clinicName: "Bulilit" };
  const meta = { id: "m1", clinicId: "c1", createdAt: startsAt };
  const e = { kind: "birthday" as const, patientId: "p1", sendAt: startsAt };

  it("renders a queued text to the primary guardian", () => {
    expect(composeMessage(e, refs, meta)).toMatchObject({ status: "queued", to: "09171234567", recipientName: "Rosa Mendoza", body: "Happy birthday, Bea!" });
  });

  it("composes nothing without a primary guardian", () => {
    const orphan = { ...patient, guardians: [{ ...bea.guardians[0]!, isPrimary: false }] };
    expect(composeMessage(e, { ...refs, patients: [orphan] }, meta)).toBeUndefined();
  });
});
