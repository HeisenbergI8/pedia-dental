import { ConflictException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { MessageKind, MessageStatus, MessageTemplate, UpdateMessageTemplateInput, choiceDeclined, isBirthdayOn, type Message } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import { Clock, manilaDate } from "../common/clock";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MessageQueueService } from "../message-queue/message-queue.service";
import { lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { DueItemsService } from "../recalls/due-items.service";

const TEMPLATE = { clinicId: true, kind: true, name: true, body: true, updatedAt: true } as const;
type TemplateRow = { clinicId: string; kind: MessageKind; name: string; body: string; updatedAt: Date };
const toTemplate = (t: TemplateRow): MessageTemplate => MessageTemplate.parse({ ...t, updatedAt: t.updatedAt.toISOString() });

const DECLINED = "This family declined reminder messages. Change it under Privacy on the child's Overview."; // mocks.ts:9
const NO_GUARDIAN = "This patient has no primary guardian to message";

/** features/messages/mocks.ts: the templates (B3), the log and the two manual texts (B9). The log itself is MessageQueueService's. */
@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    private readonly patients: PatientsService,
    private readonly dueItems: DueItemsService,
    private readonly queue: MessageQueueService,
    private readonly owners: RecordOwners,
  ) {}

  onModuleInit() {
    this.owners.register("/due-items/:id/message", async (id) => this.dueItems.patientOf(id));
  }

  /** GET /message-templates: one per kind, in MessageKind order (the seed's). */
  async templates(): Promise<MessageTemplate[]> {
    return (await this.prisma.messageTemplate.findMany({ select: TEMPLATE, orderBy: { position: "asc" } })).map(toTemplate);
  }

  /** PUT /message-templates/:kind. 404 before the body is read, as the mock; then UpdateMessageTemplateInput (400). */
  async updateTemplate(kind: string, body: unknown): Promise<MessageTemplate> {
    const known = MessageKind.safeParse(kind);
    const found = known.success && (await this.prisma.messageTemplate.findFirst({ where: { kind: known.data }, select: { kind: true } }));
    if (!found) throw new NotFoundException("Template not found");
    const input = new ZodValidationPipe(UpdateMessageTemplateInput).transform(body);
    await this.prisma.messageTemplate.updateMany({ where: { kind: found.kind }, data: { body: input.body, updatedAt: this.clock.now() } });
    return toTemplate(await this.prisma.messageTemplate.findFirstOrThrow({ where: { kind: found.kind }, select: TEMPLATE }));
  }

  /** GET /messages: newest first. An unknown `status` is ignored, as the mock's safeParse. Audited per child only (E12). */
  async list(patientId: string | undefined, status: string | undefined): Promise<Message[]> {
    const s = MessageStatus.safeParse(status);
    const rows = await this.queue.list({ ...(patientId && { patientId }), ...(s.success && { status: s.data }) });
    if (patientId) await this.audit.record("view", "Messages", patientId);
    return rows;
  }

  /** POST /due-items/:id/message: 404 → 409 booked → 409 queued → 409 declined → 409 no guardian → 201 (mocks.ts:41–54). */
  async recallMessage(id: string): Promise<Message> {
    const patientId = await this.dueItems.patientOf(id); // outside the transaction (B6 decision 3)
    if (!patientId) throw new NotFoundException("Due item not found");
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // E8: every Message write under the child's lock
      const { item, open } = (await this.dueItems.openState(tx, id))!;
      if (!open) throw new ConflictException("This is already booked");
      if (await this.queue.queuedFor(tx, id)) throw new ConflictException("A reminder is already queued for this");
      const patient = await this.patients.one(patientId, tx);
      if (choiceDeclined(patient, "reminders")) throw new ConflictException(DECLINED);
      const kind = item.kind === "follow_up" ? "follow_up_reminder" : "recall";
      const message = await this.queue.queue(tx, { kind, patientId, dueItemId: id, dueOn: item.dueOn, sendAt: this.clock.now().toISOString() }, patient);
      if (!message) throw new ConflictException(NO_GUARDIAN);
      await this.audit.record("create", "Recall message", patientId, tx);
      return message;
    });
  }

  /** POST /patients/:id/birthday-greeting: 404 → 409 declined → 409 not today → 409 this year → 409 no guardian → 201. */
  async birthdayGreeting(patientId: string): Promise<Message> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId); // 404 "Patient not found"
      const patient = await this.patients.one(patientId, tx);
      if (choiceDeclined(patient, "reminders")) throw new ConflictException(DECLINED);
      const today = manilaDate(this.clock.now());
      if (!isBirthdayOn(patient.birthDate, today)) throw new ConflictException(`It isn't ${patient.firstName}'s birthday today`);
      const year = Number(today.slice(0, 4));
      if (await this.queue.greeting(tx, patientId, year)) throw new ConflictException(`${patient.firstName} already has a birthday greeting this year`);
      const message = await this.queue.queue(tx, { kind: "birthday", patientId, sendAt: this.clock.now().toISOString() }, patient, { greetingYear: year });
      if (!message) throw new ConflictException(NO_GUARDIAN);
      await this.audit.record("create", "Birthday greeting", patientId, tx);
      return message;
    });
  }

  /** The daily job's part for one clinic (mocks/outbox.ts runDailyJobs): each birthday child once a year, each in its own short transaction. */
  async greetAll(today: string): Promise<number> {
    const year = Number(today.slice(0, 4));
    const born = (await this.patients.basics()).filter((p) => isBirthdayOn(p.birthDate, today));
    let queued = 0;
    for (const p of born) {
      const done = await runInTransaction(this.prisma, async (tx) => {
        await lockPatient(tx, p.id);
        if (await this.queue.greeting(tx, p.id, year)) return false;
        return !!(await this.queue.queue(tx, { kind: "birthday", patientId: p.id, sendAt: this.clock.now().toISOString() }, await this.patients.one(p.id, tx), { greetingYear: year }));
      });
      if (done) queued++;
    }
    return queued;
  }
}
