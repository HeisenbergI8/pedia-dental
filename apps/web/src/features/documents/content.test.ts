import { describe, expect, it } from "vitest";
import { DocumentType, formatPeso, pesos, type GenerateDocumentInput } from "@pedia/shared";
import { formatDate } from "@/lib/format";
import { buildDocument, type DocSources } from "./content";

const at = "2026-09-30T02:00:00.000Z";
const src: DocSources = {
  patient: {
    id: "p1", clinicId: "c", firstName: "Bea", lastName: "Mendoza", birthDate: "2020-07-02", sex: "female", address: "12 Mabini St, Imus",
    guardians: [{ id: "g1", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
    allergies: ["Latex"], medicalConditions: [], medications: [], alerts: [], dentalHistory: { previousClinic: "", notes: "" }, consents: [], createdAt: at,
  },
  staff: [
    { id: "staff_reyes", clinicId: "c", fullName: "Dr. Ana Reyes", role: "dentist", licenseNo: "0045821" },
    { id: "staff_cruz", clinicId: "c", fullName: "Liza Cruz", role: "front_desk" },
  ],
  procedures: [{ clinicId: "c", code: "fluoride", name: "Fluoride application", defaultDurationMin: 15, fee: pesos(800), perTooth: false }],
  visits: [{ id: "v1", clinicId: "c", patientId: "p1", dentistId: "staff_reyes", date: "2026-09-30", status: "completed", startedAt: at, completedAt: at }],
  notes: [{ id: "n1", clinicId: "c", patientId: "p1", visitId: "v1", templateId: "tpl_fluoride", values: { teeth: [] }, behavior: [], authorId: "staff_reyes", createdAt: at, signedAt: at }],
  noteTemplates: [{ id: "tpl_fluoride", name: "Fluoride application", procedure: "fluoride", fields: [] }],
  chart: [{ id: "e1", clinicId: "c", patientId: "p1", visitId: "v1", tooth: 74, surfaces: ["O"], condition: "caries", recordedBy: "staff_reyes", recordedAt: at }],
  plan: [{ id: "i1", clinicId: "c", patientId: "p1", procedureCode: "fluoride", fee: pesos(800), status: "done", completedVisitId: "v1", completedNoteId: "n1", createdAt: at }],
  invoices: [{ id: "inv1", clinicId: "c", patientId: "p1", lines: [{ planItemId: "i1", procedureCode: "fluoride", description: "Fluoride application", amount: pesos(800) }], discount: 0, issuedAt: at }],
  payments: [{ id: "pay1", clinicId: "c", patientId: "p1", invoiceId: "inv1", amount: pesos(800), method: "cash", receiptNo: "AR-000042", receivedBy: "staff_cruz", receivedAt: at }],
  messageTemplates: [{ clinicId: "c", kind: "fluoride_instructions", name: "Fluoride instructions", body: "{child_first_name} had fluoride today.", updatedAt: at }],
};
const text = (choice: Partial<GenerateDocumentInput> & Pick<GenerateDocumentInput, "type">) =>
  JSON.stringify(buildDocument({ issuedBy: "staff_reyes", ...choice }, src));

describe("document content", () => {
  it("fills a dental certificate from the visit, with nothing retyped", () => {
    const t = text({ type: "dental_certificate", sourceId: "v1" });
    for (const expected of ["Bea Mendoza", formatDate("2026-09-30"), "Fluoride application", "Rosa Mendoza", "Dr. Ana Reyes", "PRC Lic. No. 0045821"]) {
      expect(t).toContain(expected);
    }
  });

  it("fills a receipt from the payment", () => {
    const t = text({ type: "receipt", sourceId: "pay1", issuedBy: "staff_cruz" });
    for (const expected of ["AR-000042", formatPeso(pesos(800)), "Cash", "Liza Cruz", "not an official receipt"]) expect(t).toContain(expected);
    expect(t).toContain(JSON.stringify(["Balance after this", formatPeso(0)]));
  });

  it("builds all nine types with no gaps", () => {
    const choices: Record<DocumentType, Partial<GenerateDocumentInput>> = {
      dental_certificate: { sourceId: "v1" },
      treatment_plan: {},
      consent_form: { details: { scope: "general_treatment" } },
      referral_letter: { details: { referredTo: "Dr. Lim, orthodontist", reason: "an anterior crossbite" } },
      clearance: { details: { procedure: "fluoride" } },
      post_op_instructions: { sourceId: "n1" },
      prescription: { items: [{ drugId: "paracetamol_120_syr", sig: "Give 5 mL by mouth every 6 hours as needed.", quantity: "1 bottle" }] },
      receipt: { sourceId: "pay1" },
      patient_summary: {},
    };
    for (const type of DocumentType.options) {
      const t = text({ ...choices[type], type });
      expect(t, type).not.toMatch(/undefined|NaN|\{\w+\}/);
      expect(JSON.parse(t).fileName, type).toMatch(/^[a-z0-9-]+-mendoza-bea-\d{4}-\d{2}-\d{2}\.pdf$/);
    }
  });
});
