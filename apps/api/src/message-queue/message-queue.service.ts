import { Injectable } from "@nestjs/common";
import { FAILURE, choiceDeclined, composeMessage, nextSendingTime, preVisitMessageFor, reminderSendAt, smsNumber, type Appointment, type Message, type MessageEvent, type MessageStatus, type Patient } from "@pedia/shared";
import { ownClinicId } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { Prisma } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";
import { MESSAGE_COLUMNS, MESSAGE_SEND, messageData, toMessage } from "./message.rows";

/** Unsent and not yet handed to the provider: the only texts a withdrawal can stop (E7). */
const WITHDRAWABLE = { status: "queued", dispatchedAt: null } as const;

/**
 * The message log's only reader and writer (B9 E1), Prisma and the outbox only, so any feature can import it. Every
 * write runs in the caller's transaction, after the caller's locks (E8). To render a body it reads one template, the
 * dentist's name and the account's name (E1's flagged exception: reads only, never a write to another feature's table).
 */
@Injectable()
export class MessageQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * mocks/outbox.ts `queueMessage`: nothing for a family that declined reminders (privacy #14); undefined without a
   * template or primary guardian; a `failed` row for an unusable number (decision 12); else `queued` + its outbox row.
   */
  async queue(tx: Tx, e: MessageEvent, patient: Patient, extra: { greetingYear?: number } = {}): Promise<Message | undefined> {
    if (choiceDeclined(patient, "reminders")) return undefined;
    const now = this.clock.now();
    const sendAt = nextSendingTime(new Date(Math.max(Date.parse(e.sendAt), now.getTime())));
    const [template, dentist, account] = await Promise.all([
      tx.messageTemplate.findFirst({ where: { kind: e.kind }, select: { kind: true, body: true } }),
      e.dentistId ? tx.staff.findFirst({ where: { id: e.dentistId }, select: { id: true, fullName: true } }) : null,
      // A platform table: the tenant extension doesn't scope it, so the read names the clinic itself.
      tx.clinicAccount.findUniqueOrThrow({ where: { id: ownClinicId() }, select: { name: true } }),
    ]);
    const composed = composeMessage(
      { ...e, sendAt: sendAt.toISOString() },
      { templates: template ? [template] : [], patients: [patient], staff: dentist ? [dentist] : [], clinicName: account.name },
      { id: "", clinicId: ownClinicId(), createdAt: now.toISOString() },
    );
    if (!composed) return undefined;
    const usable = !!smsNumber(composed.to);
    const { id: _, ...data } = messageData(usable ? composed : { ...composed, status: "failed", failureReason: FAILURE.noPhone }, extra);
    const row = await tx.message.create({ data, select: MESSAGE_COLUMNS });
    if (usable) await this.outbox.enqueue(tx, { kind: MESSAGE_SEND, payload: { messageId: row.id }, availableAt: sendAt });
    return toMessage(row);
  }

  /** mocks/outbox.ts `queueBookingMessages`: a confirmation now, a reminder the day before, pre-visit instructions with it. */
  async queueBooking(tx: Tx, a: Pick<Appointment, "id" | "patientId" | "startsAt" | "dentistId" | "procedureCode">, patient: Patient): Promise<void> {
    const base = { patientId: a.patientId, appointmentId: a.id, startsAt: a.startsAt, dentistId: a.dentistId };
    const now = this.clock.now();
    const remindAt = reminderSendAt(a.startsAt, now);
    await this.queue(tx, { ...base, kind: "appointment_confirmation", sendAt: now.toISOString() }, patient);
    await this.queue(tx, { ...base, kind: "appointment_reminder", sendAt: remindAt }, patient);
    const pre = preVisitMessageFor(a.procedureCode);
    if (pre) await this.queue(tx, { ...base, kind: pre, sendAt: remindAt }, patient);
  }

  /** mocks/outbox.ts `cancelQueued`: a cancelled, moved or missed appointment withdraws what it queued and hasn't sent. */
  async withdrawAppointment(tx: Tx, appointmentId: string): Promise<number> {
    return (await tx.message.updateMany({ where: { appointmentId, ...WITHDRAWABLE }, data: { status: "cancelled" } })).count;
  }

  /** Privacy #14: a reminders "no" withdraws every text of the child not yet handed to the provider (E7). */
  async withdrawPatient(tx: Tx, patientId: string): Promise<number> {
    return (await tx.message.updateMany({ where: { patientId, ...WITHDRAWABLE }, data: { status: "cancelled" } })).count;
  }

  /** This Manila year's greeting for the child, whatever its status (birthdayGreeting's rule, E9). */
  async greeting(tx: Tx, patientId: string, year: number): Promise<{ status: MessageStatus } | null> {
    return tx.message.findFirst({ where: { patientId, greetingYear: year }, select: { status: true } });
  }

  /** A recall text already waiting for this due item (the mock's second 409). */
  async queuedFor(tx: Tx, dueItemId: string): Promise<boolean> {
    return !!(await tx.message.findFirst({ where: { dueItemId, status: "queued" }, select: { id: true } }));
  }

  /** GET /messages: newest `sendAt` first; ties by id, so the order is stable (B6's trap). */
  async list(where: { patientId?: string; status?: MessageStatus }): Promise<Message[]> {
    const rows = await this.prisma.message.findMany({ where, select: MESSAGE_COLUMNS, orderBy: [{ sendAt: "desc" }, { id: "desc" }] });
    return rows.map(toMessage);
  }

  /**
   * Each patient's last text that went out or was tried (sent/failed), the only one `hasNoContact` looks at; at one send
   * time a sent text wins, as `hasNoContact` breaks the tie. One query: raw SQL for the window function, so it names the
   * clinic itself (the tenant extension doesn't see raw SQL).
   */
  async lastTried(patientIds: readonly string[]): Promise<Pick<Message, "patientId" | "status" | "sendAt">[]> {
    if (!patientIds.length) return [];
    const rows = await this.prisma.$queryRaw<{ patientId: string; status: "sent" | "failed"; sendAt: Date }[]>`
      SELECT patientId, status, sendAt FROM (
        SELECT patientId, status, sendAt, ROW_NUMBER() OVER (PARTITION BY patientId ORDER BY sendAt DESC, status = 'sent' DESC, id DESC) AS rn
        FROM Message
        WHERE clinicId = ${ownClinicId()} AND status IN ('sent', 'failed') AND patientId IN (${Prisma.join([...patientIds])})
      ) last WHERE rn = 1`;
    return rows.map((r) => ({ ...r, sendAt: r.sendAt.toISOString() }));
  }

  /** Birthday rows of these children for a Manila year: what `birthdayGreeting` (Today's tick) reads. */
  async greetings(patientIds: readonly string[], year: number): Promise<Pick<Message, "patientId" | "kind" | "createdAt" | "status">[]> {
    if (!patientIds.length) return [];
    const rows = await this.prisma.message.findMany({
      where: { patientId: { in: [...patientIds] }, greetingYear: year },
      select: { patientId: true, kind: true, createdAt: true, status: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /** Decision 10 / E10: texts the provider took in a Manila month ("yyyy-MM"), and the parts it billed (decision 14). */
  async sentIn(month: string): Promise<{ texts: number; segments: number }> {
    const [y, m] = month.split("-").map(Number) as [number, number];
    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 1); // local = Manila (clinic-time.ts)
    const agg = await this.prisma.message.aggregate({ where: { sentAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { segments: true } });
    return { texts: agg._count._all, segments: agg._sum.segments ?? 0 };
  }
}
