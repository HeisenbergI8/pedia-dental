import { describe, expect, it } from "vitest";
import { DocumentType, formatPeso, pesos, type GenerateDocumentInput } from "@pedia/shared";
import { formatDate } from "@/lib/format";
import { buildDocument, type DocSources } from "./content";
import { initialDraft } from "./components/documents-tab";

const at = "2026-09-30T02:00:00.000Z";
const src: DocSources = {
  clinicName: "Bulilit Smiles Pediatric Dental",
  patient: {
    id: "p1", clinicId: "c", patientNo: "KS-00001", firstName: "Bea", lastName: "Mendoza", birthDate: "2020-07-02", sex: "female", address: "12 Mabini St, Imus",
    guardians: [{ id: "g1", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
    allergies: ["Latex"], medicalConditions: [], medications: [], alerts: [], dentalHistory: { previousClinic: "", notes: "" }, consents: [], createdAt: at,
  },
  staff: [
    { id: "staff_reyes", clinicId: "c", fullName: "Dr. Ana Reyes", role: "dentist", licenseNo: "0045821", branchIds: ["b"] },
    { id: "staff_cruz", clinicId: "c", fullName: "Liza Cruz", role: "front_desk", branchIds: ["b"] },
  ],
  procedures: [{ clinicId: "c", code: "fluoride", name: "Fluoride application", defaultDurationMin: 15, fee: pesos(800), perTooth: false }],
  visits: [{ id: "v1", clinicId: "c", patientId: "p1", dentistId: "staff_reyes", date: "2026-09-30", status: "completed", startedAt: at, completedAt: at }],
  notes: [{ id: "n1", clinicId: "c", patientId: "p1", visitId: "v1", templateId: "tpl_fluoride", values: { teeth: [] }, behavior: [], authorId: "staff_reyes", createdAt: at, signedAt: at }],
  noteTemplates: [{ id: "tpl_fluoride", name: "Fluoride application", procedure: "fluoride", fields: [] }],
  chart: [{ id: "e1", clinicId: "c", patientId: "p1", visitId: "v1", tooth: 74, surfaces: ["O"], condition: "caries", recordedBy: "staff_reyes", recordedAt: at }],
  plan: [{ id: "i1", clinicId: "c", patientId: "p1", procedureCode: "fluoride", fee: pesos(800), status: "done", completedVisitId: "v1", completedNoteId: "n1", createdAt: at }],
  invoices: [{ id: "inv1", clinicId: "c", branchId: "b", patientId: "p1", lines: [{ planItemId: "i1", procedureCode: "fluoride", description: "Fluoride application", amount: pesos(800) }], discount: 0, issuedAt: at }],
  payments: [{ id: "pay1", clinicId: "c", branchId: "b", patientId: "p1", invoiceId: "inv1", amount: pesos(800), method: "cash", receiptNo: "AR-000042", receivedBy: "staff_cruz", receivedAt: at }],
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

  it("builds every type with no gaps", () => {
    const choices: Record<DocumentType, Partial<GenerateDocumentInput>> = {
      dental_certificate: { sourceId: "v1" },
      treatment_plan: {},
      consent_form: { details: { scope: "general_treatment" } },
      referral_letter: { details: { referredTo: "Dr. Lim, orthodontist", reason: "an anterior crossbite" } },
      clearance: { details: { procedure: "fluoride" } },
      dental_clearance: { sourceId: "v1", details: { purpose: "School enrolment" } },
      post_op_instructions: { sourceId: "n1" },
      prescription: { items: [{ drugId: "paracetamol_120_syr", sig: "Give 5 mL by mouth every 6 hours as needed.", quantity: "1 bottle" }] },
      receipt: { sourceId: "pay1" },
      patient_summary: {},
      notes_report: {},
    };
    for (const type of DocumentType.options) {
      const t = text({ ...choices[type], type });
      expect(t, type).not.toMatch(/undefined|NaN|\{\w+\}/);
      expect(JSON.parse(t).fileName, type).toMatch(/^[a-z0-9-]+-mendoza-bea-\d{4}-\d{2}-\d{2}\.pdf$/);
    }
  });

  it("leaves the guardian's address out of a dentist-issued notes report", () => {
    expect(text({ type: "notes_report", issuedBy: "staff_reyes" })).not.toContain("12 Mabini St");
    expect(text({ type: "notes_report", issuedBy: "staff_cruz" })).toContain("12 Mabini St");
  });

  it("reports signed notes with their services and prices", () => {
    const t = text({ type: "notes_report" });
    for (const expected of ["Clinical notes report", "Fluoride application", formatPeso(pesos(800)), "Dr. Ana Reyes"]) expect(t).toContain(expected);
  });

  it("fills a dental clearance from the exam visit and lists any treatment still planned", () => {
    const t = text({ type: "dental_clearance", sourceId: "v1", details: { purpose: "School enrolment" } });
    expect(t).toContain(JSON.stringify(["Cleared for", "School enrolment"]));
    expect(t).toContain("is cleared. No dental treatment is pending.");
    const planned = JSON.stringify(buildDocument({ type: "dental_clearance", issuedBy: "staff_reyes", sourceId: "v1", details: { purpose: "Surgery" } }, { ...src, plan: [{ ...src.plan[0], status: "planned" }] }));
    expect(planned).toContain(JSON.stringify(["Dental treatment still planned", "Fluoride application"]));
  });

  it("words a deposit receipt as held on the account, and leaves an invoice receipt as it was", () => {
    const deposit = { ...src.payments[0], id: "dep1", invoiceId: undefined, amount: pesos(1000), receiptNo: "AR-000050" };
    const t = JSON.stringify(buildDocument({ type: "receipt", sourceId: "dep1", issuedBy: "staff_cruz" }, { ...src, payments: [...src.payments, deposit] }));
    expect(t).toContain(JSON.stringify(["For", "Deposit on account"]));
    expect(t).toContain(JSON.stringify(["Deposit after this", formatPeso(pesos(1000))]));
    expect(text({ type: "receipt", sourceId: "pay1", issuedBy: "staff_cruz" })).toContain(JSON.stringify(["Balance after this", formatPeso(0)]));
  });
});

describe("initialDraft", () => {
  it("a dentist signs their own documents; anyone else gets the dentist who saw the child last", () => {
    expect(initialDraft("dental_certificate", src, "staff_reyes").issuedBy).toBe("staff_reyes");
    expect(initialDraft("dental_certificate", src, "staff_cruz").issuedBy).toBe("staff_reyes");
    expect(initialDraft("receipt", src, "staff_cruz").issuedBy).toBe("staff_cruz");
  });
  it("preselects the clearance procedure only when one treatment is planned", () => {
    const item = (id: string, procedureCode: string) => ({ ...src.plan[0], id, procedureCode, status: "planned" as const });
    expect(initialDraft("clearance", { ...src, plan: [item("i1", "extraction")] }).details).toEqual({ procedure: "extraction" });
    expect(initialDraft("clearance", { ...src, plan: [item("i1", "extraction"), item("i2", "pulpotomy")] }).details).toEqual({});
  });
});
