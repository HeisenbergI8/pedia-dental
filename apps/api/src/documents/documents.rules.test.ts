import { PatientDocument, type GenerateDocumentInput } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { toDocument, type DocumentRow } from "./document.rows";
import { documentRefusal, documentTitle, type DocumentFacts } from "./documents.rules";

const dentist = { role: "dentist" as const, alsoRoles: [] };
const desk = { role: "front_desk" as const, alsoRoles: [] };
const bea = { firstName: "Bea", allergies: ["Penicillin", "Latex"] };
const facts = (over: Partial<DocumentFacts> = {}): DocumentFacts => ({ issuer: dentist, sourceFits: true, patient: bea, ...over });
const rx = (drugId: string): GenerateDocumentInput => ({ type: "prescription", issuedBy: "staff_reyes", items: [{ drugId, sig: "Give 5 mL.", quantity: "1 bottle" }] });
const certificate: GenerateDocumentInput = { type: "dental_certificate", sourceId: "v1", issuedBy: "staff_cruz" };

describe("documentRefusal (documents/mocks.ts:54–63, in its order)", () => {
  it("refuses an unknown issuer first, whatever else is wrong", () => {
    expect(documentRefusal(certificate, facts({ issuer: undefined, sourceFits: false }))).toEqual({ status: 400, message: "Unknown staff member" });
  });

  it("needs a dentist for a dentist-signed document, before looking at the source", () => {
    expect(documentRefusal(certificate, facts({ issuer: desk, sourceFits: false }))).toEqual({ status: 400, message: "A dentist has to issue the dental certificate" });
    expect(documentRefusal({ type: "notes_report", issuedBy: "staff_cruz" }, facts({ issuer: desk }))).toBeUndefined();
  });

  it("refuses a source that doesn't fit before an allergy clash", () => {
    expect(documentRefusal({ type: "receipt", sourceId: "x", issuedBy: "staff_cruz" }, facts({ issuer: desk, sourceFits: false }))).toEqual({ status: 400, message: "Pick the payment for this patient" });
    expect(documentRefusal({ ...rx("amoxicillin_250_susp"), type: "post_op_instructions", sourceId: "n1" }, facts({ sourceFits: false }))).toEqual({
      status: 400,
      message: "Pick the signed treatment note for this patient",
    });
  });

  it("stops a prescription that clashes with a recorded allergy, in the mock's words, and lets a safe one through", () => {
    expect(documentRefusal(rx("amoxicillin_250_susp"), facts())).toEqual({ status: 409, message: "Bea is allergic to Amoxicillin (recorded: Penicillin, Latex)" });
    expect(documentRefusal(rx("paracetamol_120_syr"), facts())).toBeUndefined();
  });

  it("titles a document by its type and the child", () => {
    expect(documentTitle({ type: "notes_report" }, { firstName: "Bea", lastName: "Mendoza" })).toBe("Clinical notes report · Bea Mendoza");
  });
});

describe("toDocument", () => {
  const row: DocumentRow = { id: "d1", clinicId: "c1", patientId: "p1", type: "notes_report", title: "T", sourceId: null, details: null, items: null, issuedBy: "s1", createdAt: new Date("2026-10-02T01:00:00.000Z") };
  it("round-trips with and without the optional parts", () => {
    expect(PatientDocument.parse(toDocument(row))).toEqual(toDocument(row));
    expect(toDocument(row)).not.toHaveProperty("details");
    const full = toDocument({ ...row, type: "prescription", sourceId: "n1", details: { purpose: "School" }, items: [{ drugId: "paracetamol_120_syr", sig: "Give 5 mL.", quantity: "1 bottle" }] });
    expect(PatientDocument.parse(full)).toMatchObject({ sourceId: "n1", details: { purpose: "School" }, items: [{ drugId: "paracetamol_120_syr" }] });
  });
});
