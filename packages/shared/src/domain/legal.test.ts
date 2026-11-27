import { describe, expect, it } from "vitest";
import { LEGAL_DOCUMENTS, choiceDeclined, noticeTemplate, termsOutdated } from "./legal";

const agreement = (termsVersion: number, dpaVersion: number) => ({
  termsVersion,
  dpaVersion,
  acceptedBy: "Dr. Paolo Villanueva",
  at: "2026-10-13T02:00:00.000Z",
  method: "online" as const,
});

describe("legal templates (privacy #2–#6)", () => {
  it("gives every document a version, a date and some text", () => {
    for (const doc of Object.values(LEGAL_DOCUMENTS)) {
      expect(doc.version, doc.key).toBeGreaterThan(0);
      expect(doc.date, doc.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.sections.flatMap((s) => s.paragraphs).join(" ").length, doc.key).toBeGreaterThan(200);
    }
  });

  it("states hosting and has no placeholder left in any document", () => {
    for (const key of ["dpa", "privacy"] as const) expect(JSON.stringify(LEGAL_DOCUMENTS[key]), key).toContain("Google Cloud (Google Asia Pacific Pte. Ltd.) in Singapore");
    for (const doc of Object.values(LEGAL_DOCUMENTS)) expect(JSON.stringify(doc), doc.key).not.toMatch(/to be confirmed|counsel/i);
  });

  it("fills the clinic's name into the notice template and leaves no placeholder", () => {
    const body = noticeTemplate("Bulilit Dental");
    expect(body).toContain("Bulilit Dental collects");
    expect(body).not.toMatch(/\{\w+\}/);
    expect(body.split("\n\n").length).toBeGreaterThan(5);
  });
});

describe("termsOutdated (#9)", () => {
  const { terms, dpa } = LEGAL_DOCUMENTS;
  it("asks again without an agreement or when either document moved on", () => {
    expect(termsOutdated(undefined)).toBe(true);
    expect(termsOutdated(agreement(terms.version, dpa.version))).toBe(false);
    expect(termsOutdated(agreement(terms.version - 1, dpa.version))).toBe(true);
    expect(termsOutdated(agreement(terms.version, dpa.version - 1))).toBe(true);
  });
});

describe("choiceDeclined (#14)", () => {
  const row = (photos: boolean, reminders: boolean) => ({ photos, reminders, by: "staff" as const, byName: "Liza Cruz", at: "2026-10-13T02:00:00.000Z" });
  it("blocks only an explicit no, and the newest row wins", () => {
    expect(choiceDeclined({}, "photos")).toBe(false); // never recorded (#18): not a block
    expect(choiceDeclined({ privacyChoices: [row(false, true)] }, "photos")).toBe(true);
    expect(choiceDeclined({ privacyChoices: [row(false, true)] }, "reminders")).toBe(false);
    expect(choiceDeclined({ privacyChoices: [row(false, true), row(true, true)] }, "photos")).toBe(false);
  });
});
