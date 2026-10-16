import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { NoteTemplate, UpdateNoteInput, type ClinicalNote, type CreateNoteInput } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { ZodIssuesException, ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Prisma } from "../generated/prisma/client.ts";
import { lockPatient, lockPatientIfExists } from "../patients/patient-lock";
import { PlanService } from "../plan/plan.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { NOTE_COLUMNS, NOTE_ORDER, toNote } from "./note.rows";
import { NOTE_NOT_FOUND, checkValues, editRefusal, signRefusal, startRefusal, teethOf, type CheckedValues } from "./note.rules";

/** checkValues' answer as a value or the mock's 400 (plain text for the template, the issues array for the values). */
function valuesOrThrow(checked: CheckedValues): Prisma.InputJsonObject {
  if ("refusal" in checked) refuse(checked.refusal);
  if ("issues" in checked) throw new ZodIssuesException(checked.issues);
  return (checked as { values: Record<string, unknown> }).values as Prisma.InputJsonObject;
}

/**
 * features/notes/mocks.ts. B3 served the templates; B6 the notes. A signed note is read-only (CHUNKS B6, decision 6):
 * every change is checked under the patient's lock AND written as an update guarded by `signedAt: null`.
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly visits: VisitsService,
    private readonly plan: PlanService,
    private readonly clock: Clock,
  ) {}

  /** GET /note-templates: the clinic's forms in the mock's order (one per catalog procedure). */
  async templates(): Promise<NoteTemplate[]> {
    const rows = await this.prisma.noteTemplate.findMany({ select: { id: true, name: true, procedure: true, fields: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    return rows.map((t) => NoteTemplate.parse(t));
  }

  /** GET /patients/:id/notes, newest first. [] for an unknown patient. Audited (decision 7). */
  async list(patientId: string): Promise<ClinicalNote[]> {
    const rows = await this.prisma.clinicalNote.findMany({ where: { patientId }, select: NOTE_COLUMNS, orderBy: [...NOTE_ORDER] });
    await this.audit.record("view", "Clinical notes", patientId);
    return rows.map(toNote);
  }

  /** POST /patients/:id/notes after the body parsed (400): 404 → 409 → 400 template → 400 values. A draft. */
  async create(patientId: string, input: CreateNoteInput): Promise<ClinicalNote> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatientIfExists(tx, patientId); // an unknown patient is the visit's 404, as the mock
      const visit = await this.visits.forPatient(tx, input.visitId, patientId);
      refuse(startRefusal(visit));
      const values = valuesOrThrow(checkValues(await this.template(input.templateId, tx), input.values));
      const row = await tx.clinicalNote.create({
        data: {
          ...clinicData(), patientId, visitId: visit!.id, templateId: input.templateId, values, behavior: input.behavior,
          behaviorNote: input.behaviorNote ?? null, authorId: visit!.dentistId, createdAt: this.clock.now(),
        },
        select: NOTE_COLUMNS,
      });
      await this.audit.record("create", "Clinical note", patientId, tx);
      return toNote(row);
    });
  }

  /** PUT /notes/:id: 404 → 409 signed → 400 body → 400 template → 400 values. `behaviorNote` only when sent (mock). */
  async update(id: string, body: unknown): Promise<ClinicalNote> {
    const patientId = await this.patientOf(id);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const note = await this.read(tx, id);
      refuse(editRefusal(note));
      const input = new ZodValidationPipe(UpdateNoteInput).transform(body);
      const values = valuesOrThrow(checkValues(await this.template(note.templateId, tx), input.values));
      await this.guarded(tx, id, {
        values, behavior: input.behavior, ...("behaviorNote" in input && { behaviorNote: input.behaviorNote ?? null }),
      }, "A signed note can't be changed");
      await this.audit.record("update", "Clinical note", patientId, tx);
      return this.read(tx, id);
    });
  }

  /** POST /notes/:id/sign: 404 → 409. Signs, then completes the plan items it covers, in one transaction. */
  async sign(id: string): Promise<ClinicalNote> {
    const patientId = await this.patientOf(id);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const note = await this.read(tx, id);
      refuse(signRefusal(note));
      await this.guarded(tx, id, { signedAt: this.clock.now() }, "This note is already signed");
      const procedure = (await this.template(note.templateId, tx))?.procedure ?? "";
      await this.plan.completeBy(tx, patientId, procedure, teethOf(note.values), note);
      // B7: dueItemFor(procedure, visit.date, note.values): close this procedure's open due item and open the new one,
      //     here, in this transaction (notes/mocks.ts:81–97, B6 decision 1).
      // B9: NOTE_MESSAGES[procedure] → OutboxService.enqueue(tx, …), the parent's care instructions (notes/mocks.ts:98–100).
      await this.audit.record("update", "Clinical note (signed)", patientId, tx);
      return this.read(tx, id);
    });
  }

  /** The note's patient, read outside the transaction (decision 3): `patientId` never changes, notes are never deleted. */
  private async patientOf(id: string): Promise<string> {
    const row = await this.prisma.clinicalNote.findUnique({ where: { id }, select: { patientId: true } });
    if (!row) throw new NotFoundException(NOTE_NOT_FOUND);
    return row.patientId;
  }

  private async read(tx: Tx, id: string): Promise<ClinicalNote> {
    return toNote(await tx.clinicalNote.findUniqueOrThrow({ where: { id }, select: NOTE_COLUMNS }));
  }

  /** This clinic's template, in the caller's transaction. Key (clinicId, id): the extension adds clinicId. */
  private async template(id: string, tx: Tx): Promise<NoteTemplate | undefined> {
    const row = await tx.noteTemplate.findFirst({ where: { id }, select: { id: true, name: true, procedure: true, fields: true } });
    return row ? NoteTemplate.parse(row) : undefined;
  }

  /** The read-only rule's second half (decision 6): a change touches the note only while it is unsigned. */
  private async guarded(tx: Tx, id: string, data: Prisma.ClinicalNoteUpdateManyMutationInput, words: string): Promise<void> {
    const { count } = await tx.clinicalNote.updateMany({ where: { id, signedAt: null }, data });
    if (count !== 1) throw new ConflictException(words);
  }
}
