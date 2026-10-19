import { Injectable } from "@nestjs/common";
import { FAILURE, choiceDeclined, composeMessage, nextSendingTime, preVisitMessageFor, reminderSendAt, smsNumber, type Appointment, type Guardian, type Message, type MessageEvent, type MessageStatus, type Patient } from "@pedia/shared";
import { ownClinicId } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { Prisma } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service";
import { STANDING_REFRESH } from "../patients/standing-refresh";
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
/** What composeMessage needs besides the patient (B14: read once per booking). */
type Refs = Omit<Parameters<typeof composeMessage>[1], "patients">;

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
    return this.write(tx, e, patient, await this.refs(tx, [e.kind], e.dentistId), extra);
  }

  /** The templates, dentist and clinic name a text is composed from. One read each, however many texts share them. */
  private async refs(tx: Tx, kinds: readonly MessageEvent["kind"][], dentistId: string | undefined): Promise<Refs> {
    const [templates, dentist, account] = await Promise.all([
      tx.messageTemplate.findMany({ where: { kind: { in: [...kinds] } }, select: { kind: true, body: true } }),
      dentistId ? tx.staff.findFirst({ where: { id: dentistId }, select: { id: true, fullName: true } }) : null,
      // A platform table: the tenant extension doesn't scope it, so the read names the clinic itself.
      tx.clinicAccount.findUniqueOrThrow({ where: { id: ownClinicId() }, select: { name: true } }),
    ]);
    return { templates, staff: dentist ? [dentist] : [], clinicName: account.name };
  }

  private async write(tx: Tx, e: MessageEvent, patient: Patient, refs: Refs, extra: { greetingYear?: number }): Promise<Message | undefined> {
    const now = this.clock.now();
    const sendAt = nextSendingTime(new Date(Math.max(Date.parse(e.sendAt), now.getTime())));
    const composed = composeMessage(
      { ...e, sendAt: sendAt.toISOString() },
      { ...refs, patients: [patient] },
      { id: "", clinicId: ownClinicId(), createdAt: now.toISOString() },
    );
    if (!composed) return undefined;
    const usable = !!smsNumber(composed.to);
    const { id: _, ...data } = messageData(usable ? composed : { ...composed, status: "failed", failureReason: FAILURE.noPhone }, extra);
    const row = await tx.message.create({ data, select: MESSAGE_COLUMNS });
    if (usable) await this.outbox.enqueue(tx, { kind: MESSAGE_SEND, payload: { messageId: row.id }, availableAt: sendAt });
    // B14: born failed (no usable number) is a text settling too: the child's "no contact" is recomputed, as the send
    // handler's failures are.
    else await this.outbox.enqueue(tx, { kind: STANDING_REFRESH, payload: { patientId: patient.id } });
    return toMessage(row);
  }

  /**
   * An invite or reset text (B11 E4): to this guardian's own number, now, whatever the hour (decision 12) and the
   * family's reminders choice (decision 20). The body holds [link]; the sender puts the real link in (E5).
   */
  async queueAccountText(
    tx: Tx,
    t: { kind: "portal_invite" | "password_reset"; patientId: string; guardian: Pick<Guardian, "fullName" | "phone">; linkId: string; body: string },
  ): Promise<Message> {
    const now = this.clock.now();
    const row = await tx.message.create({
      data: {
        clinicId: ownClinicId(), patientId: t.patientId, kind: t.kind, channel: "sms", to: t.guardian.phone, recipientName: t.guardian.fullName,
        body: t.body, status: "queued", sendAt: now, createdAt: now, linkId: t.linkId,
      },
      select: MESSAGE_COLUMNS,
    });
    await this.outbox.enqueue(tx, { kind: MESSAGE_SEND, payload: { messageId: row.id }, availableAt: now });
    return toMessage(row);
  }

  /** Withdraws the account texts of these links not yet handed to the provider (a resend, a turn-off: B11 E9). */
  async withdrawLinks(tx: Tx, linkIds: readonly string[]): Promise<number> {
    if (!linkIds.length) return 0;
    return (await tx.message.updateMany({ where: { linkId: { in: [...linkIds] }, ...WITHDRAWABLE }, data: { status: "cancelled" } })).count;
  }

  /** mocks/outbox.ts `queueBookingMessages`: a confirmation now, a reminder the day before, pre-visit instructions with it. */
  async queueBooking(tx: Tx, a: Pick<Appointment, "id" | "patientId" | "startsAt" | "dentistId" | "procedureCode">, patient: Patient): Promise<void> {
    const base = { patientId: a.patientId, appointmentId: a.id, startsAt: a.startsAt, dentistId: a.dentistId };
    const now = this.clock.now();
    const remindAt = reminderSendAt(a.startsAt, now);
    const pre = preVisitMessageFor(a.procedureCode);
    const events: MessageEvent[] = [
      { ...base, kind: "appointment_confirmation", sendAt: now.toISOString() },
      { ...base, kind: "appointment_reminder", sendAt: remindAt },
      ...(pre ? [{ ...base, kind: pre, sendAt: remindAt }] : []),
    ];
    if (choiceDeclined(patient, "reminders")) return;
    // B14: one read of the templates, dentist and clinic for all of them (this runs inside the clinic's lock).
    const refs = await this.refs(tx, events.map((e) => e.kind), a.dentistId);
    for (const e of events) await this.write(tx, e, patient, refs, {});
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
  async lastTried(patientIds: readonly string[], tx: Tx = this.prisma): Promise<Pick<Message, "patientId" | "status" | "sendAt">[]> {
    if (!patientIds.length) return [];
    const rows = await tx.$queryRaw<{ patientId: string; status: "sent" | "failed"; sendAt: Date }[]>`
      SELECT patientId, status, sendAt FROM (
        SELECT patientId, status, sendAt, ROW_NUMBER() OVER (PARTITION BY patientId ORDER BY sendAt DESC, status = 'sent' DESC, id DESC) AS rn
        FROM Message
        WHERE clinicId = ${ownClinicId()} AND status IN ('sent', 'failed') AND kind NOT IN ('portal_invite', 'password_reset')
          AND patientId IN (${Prisma.join([...patientIds])})
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
