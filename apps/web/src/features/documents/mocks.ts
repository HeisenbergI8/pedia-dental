import { http, HttpResponse, delay } from "msw";
import {
  DENTIST_SIGNED,
  DOCUMENT_SOURCE,
  DOCUMENT_TYPE_LABEL,
  GenerateDocumentInput,
  NOTE_MESSAGES,
  allergyConflicts,
  type GenerateDocumentInput as Input,
  type PatientDocument,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;
const newestFirst = (a: PatientDocument, b: PatientDocument) => b.createdAt.localeCompare(a.createdAt);

/** True when `sourceId` is the right kind of record, for this patient, in a state a document can come from. */
function sourceFits(d: Input, patientId: string): boolean {
  switch (DOCUMENT_SOURCE[d.type]?.kind) {
    case "visit":
      return db.visits.some((v) => v.id === d.sourceId && v.patientId === patientId && v.status === "completed");
    case "payment":
      return db.payments.some((p) => p.id === d.sourceId && p.patientId === patientId);
    case "note": {
      const note = db.notes.find((n) => n.id === d.sourceId && n.patientId === patientId && n.signedAt);
      const procedure = note && db.noteTemplates.find((t) => t.id === note.templateId)?.procedure;
      return !!procedure && !!NOTE_MESSAGES[procedure]; // a procedure with care instructions
    }
    default:
      return true;
  }
}

/** API contract for apps/api's DocumentsController. Logs what was generated; the PDF is built in the browser. */
export const documentHandlers = [
  http.get(url("/patients/:id/documents"), async ({ params }) => {
    await delay(100);
    return HttpResponse.json(db.documents.filter((d) => d.patientId === params.id).sort(newestFirst));
  }),

  // Every document issued across the clinic, newest first (the /documents page).
  http.get(url("/documents"), async () => {
    await delay(100);
    return HttpResponse.json([...db.documents].sort(newestFirst).slice(0, 100));
  }),

  http.post(url("/patients/:id/documents"), async ({ params, request }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    const parsed = GenerateDocumentInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const input = parsed.data;

    const issuer = db.staff.find((s) => s.id === input.issuedBy);
    if (!issuer) return new HttpResponse("Unknown staff member", { status: 400 });
    if (DENTIST_SIGNED.includes(input.type) && issuer.role !== "dentist") {
      return new HttpResponse(`A dentist has to issue the ${DOCUMENT_TYPE_LABEL[input.type].toLowerCase()}`, { status: 400 });
    }
    if (!sourceFits(input, patient.id)) return new HttpResponse(`${DOCUMENT_SOURCE[input.type]?.missing} for this patient`, { status: 400 });
    const clash = allergyConflicts(patient.allergies, input.items ?? []);
    if (clash.length) {
      return new HttpResponse(`${patient.firstName} is allergic to ${clash.map((d) => d.name).join(", ")} (recorded: ${patient.allergies.join(", ")})`, { status: 409 });
    }

    const doc: PatientDocument = {
      ...input,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: patient.id,
      title: `${DOCUMENT_TYPE_LABEL[input.type]} · ${patient.firstName} ${patient.lastName}`,
      createdAt: new Date().toISOString(),
    };
    db.documents.push(doc);
    persist();
    return HttpResponse.json(doc, { status: 201 });
  }),
];
