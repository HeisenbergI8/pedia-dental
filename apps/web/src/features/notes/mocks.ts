import { http, HttpResponse, delay } from "msw";
import { CreateNoteInput, NOTE_MESSAGES, UpdateNoteInput, dueItemFor, itemsCompletedBy, noteValuesSchema, type ClinicalNote } from "@pedia/shared";
import { env } from "@/lib/env";
import { db, persist } from "@/mocks/db";
import { queueMessage } from "@/mocks/outbox";
import { CLINIC_ID } from "@/mocks/seed";

const url = (p: string) => `${env.apiUrl}${p}`;

/** Parses the values against the note's template. Returns the cleaned values, or an error response. */
function checkValues(templateId: string, values: unknown) {
  const template = db.noteTemplates.find((t) => t.id === templateId);
  if (!template) return new HttpResponse("Unknown note template", { status: 400 });
  const parsed = noteValuesSchema(template).safeParse(values);
  return parsed.success ? parsed.data : HttpResponse.json(parsed.error.issues, { status: 400 });
}

/** API contract for apps/api's NotesController. A signed note is read-only: 409 on any change. */
export const noteHandlers = [
  http.get(url("/note-templates"), async () => {
    await delay(100);
    return HttpResponse.json(db.noteTemplates);
  }),

  http.get(url("/patients/:id/notes"), async ({ params }) => {
    await delay(100);
    const rows = db.notes
      .filter((n) => n.patientId === params.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return HttpResponse.json(rows);
  }),

  http.post(url("/patients/:id/notes"), async ({ params, request }) => {
    const parsed = CreateNoteInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const visit = db.visits.find((v) => v.id === parsed.data.visitId && v.patientId === params.id);
    if (!visit) return new HttpResponse("Visit not found for this patient", { status: 404 });
    if (visit.status !== "in_progress") return new HttpResponse("Notes are started during a visit in progress", { status: 409 });
    const values = checkValues(parsed.data.templateId, parsed.data.values);
    if (values instanceof Response) return values;

    const note: ClinicalNote = {
      ...parsed.data,
      values,
      id: crypto.randomUUID(),
      clinicId: CLINIC_ID,
      patientId: String(params.id),
      authorId: visit.dentistId,
      createdAt: new Date().toISOString(),
    };
    db.notes.push(note);
    persist();
    return HttpResponse.json(note, { status: 201 });
  }),

  http.put(url("/notes/:id"), async ({ params, request }) => {
    const note = db.notes.find((n) => n.id === params.id);
    if (!note) return new HttpResponse("Note not found", { status: 404 });
    if (note.signedAt) return new HttpResponse("A signed note can't be changed", { status: 409 });
    const parsed = UpdateNoteInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const values = checkValues(note.templateId, parsed.data.values);
    if (values instanceof Response) return values;

    Object.assign(note, parsed.data, { values });
    persist();
    return HttpResponse.json(note);
  }),

  http.post(url("/notes/:id/sign"), async ({ params }) => {
    const note = db.notes.find((n) => n.id === params.id);
    if (!note) return new HttpResponse("Note not found", { status: 404 });
    if (note.signedAt) return new HttpResponse("This note is already signed", { status: 409 });
    const signedAt = new Date().toISOString();
    note.signedAt = signedAt;

    // Signing is what completes treatment plan items for this procedure and these teeth.
    const procedure = db.noteTemplates.find((t) => t.id === note.templateId)?.procedure ?? "";
    const teeth = Array.isArray(note.values.teeth) ? (note.values.teeth as number[]) : [];
    const plan = db.planItems.filter((i) => i.patientId === note.patientId);
    for (const item of itemsCompletedBy(procedure, teeth, plan)) {
      Object.assign(item, { status: "done", completedVisitId: note.visitId, completedNoteId: note.id });
    }

    // Signing is also what makes a follow-up or recall fall due (DEFAULT_FOLLOW_UP_RULES).
    const visit = db.visits.find((v) => v.id === note.visitId);
    const due = visit && dueItemFor(procedure, visit.date, note.values);
    if (due) {
      for (const old of db.dueItems) {
        // Same procedure, any rule: a high-risk exam replaces the open 6-month recall, and the reverse.
        if (old.patientId === note.patientId && old.procedure === procedure && !old.closedAt) old.closedAt = signedAt;
      }
      db.dueItems.push({
        ...due,
        id: crypto.randomUUID(),
        clinicId: CLINIC_ID,
        patientId: note.patientId,
        sourceNoteId: note.id,
        createdAt: signedAt,
      });
    }
    // And it queues the parent's care instructions for that procedure (NOTE_MESSAGES).
    const instructions = NOTE_MESSAGES[procedure];
    if (instructions) queueMessage({ kind: instructions, patientId: note.patientId, noteId: note.id, sendAt: signedAt });
    persist();
    return HttpResponse.json(note);
  }),
];
