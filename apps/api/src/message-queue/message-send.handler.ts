import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { FAILURE, FREE_TEXT_KINDS, LINK_MARK, MESSAGE_RETRY_DELAYS_MS, dailyTextCap, isAccountText, isFreeText, textAllowance, manilaMonth, nextSendingTime, smsNumber, smsSegments, textPartsRefusal, uncountedKinds, type LoggedMessageKind, type Tier } from "@pedia/shared";
import { addDays, addMonths, format, parseISO } from "date-fns";
import { lockAccount } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { ENV, type Env } from "../config/env";
import { MetricsService } from "../metrics/metrics.service";
import { OutboxDefer, type OutboxEnvelope, type OutboxHandler, OutboxHandlers, OutboxPermanent } from "../outbox/outbox.handlers";
import { OutboxService } from "../outbox/outbox.service";
import { STANDING_REFRESH } from "../patients/standing-refresh";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { AccountLinks } from "./account-links";
import { MESSAGE_SEND } from "./message.rows";
import { SMS_PROVIDER, SmsInDoubt, SmsRejected, type SmsProvider } from "./sms-provider";

/** A Manila month's start and the next one's, as instants (B12 E9). */
const monthStart = (month: string) => new Date(`${month}-01T00:00:00+08:00`);
const nextMonth = (month: string) => format(addMonths(parseISO(`${month}-01`), 1), "yyyy-MM");

/**
 * Billed parts this clinic handed to the provider in `month` (decision 18): the claims' `segments`, by `dispatchedAt`.
 * Template texts and, from INVITES_COUNT_FROM, invites (text-abuse limits): resets and number-change warnings are never
 * refused, so they never count either, or a stranger asking for resets could use up the clinic's month (audit #3).
 */
export async function partsIn(tx: Tx, month: string): Promise<number> {
  const { _sum } = await tx.message.aggregate({
    where: { dispatchedAt: { gte: monthStart(month), lt: monthStart(nextMonth(month)) }, kind: { notIn: [...uncountedKinds(month)] } },
    _sum: { segments: true },
  });
  return _sum.segments ?? 0;
}

/** This clinic's month's allowance: its plan's parts plus that month's confirmed top-ups (textAllowance). */
export async function allowanceIn(tx: Tx, clinicId: string, tier: Tier, month: string): Promise<number> {
  const bought = (await tx.textTopUp.aggregate({ where: { clinicId, month }, _sum: { parts: true } }))._sum.parts ?? 0;
  return textAllowance(tier, bought);
}

/** Texts that only make sense before their appointment: one held past its start is failed, not sent late. */
const BEFORE_VISIT_KINDS: readonly string[] = ["appointment_confirmation", "appointment_reminder", "pre_treatment"];

/**
 * The platform's daily cap (text-abuse limits): billed parts every clinic handed to the provider since Manila midnight,
 * free texts left out as they pass it, against dailyTextCap. Raw SQL across clinics on purpose. Each claim holds only
 * its own clinic's lock, so clinics claiming at the same instant may pass it by a batch: a safety net, not a bill.
 */
export async function dailyCapState(tx: Tx, today: string, max: number | undefined): Promise<{ used: number; cap: number }> {
  const since = new Date(`${today}T00:00:00+08:00`);
  const free = Prisma.join([...FREE_TEXT_KINDS]);
  const [row] = await tx.$queryRaw<{ n: bigint | number | string | null }[]>`
    SELECT SUM(segments) AS n FROM Message WHERE dispatchedAt >= ${since} AND kind NOT IN (${free})`;
  const month = manilaMonth(today);
  const clinics = await tx.$queryRaw<{ tier: Tier; bought: bigint | number | string | null }[]>`
    SELECT a.tier, (SELECT SUM(t.parts) FROM TextTopUp t WHERE t.clinicId = a.id AND t.month = ${month}) AS bought
    FROM ClinicAccount a WHERE a.status = 'active'`;
  return { used: Number(row?.n ?? 0), cap: dailyTextCap(clinics.map((c) => textAllowance(c.tier, Number(c.bought ?? 0))), max) };
}

type Claim = { send: { number: string; body: string; dispatchedAt: Date; patientId: string; kind: string } } | { skip: true } | { permanent: string } | { defer: Date };

/**
 * Sends one Message (E2, E3). At least once from the outbox becomes exactly once here: the row is claimed
 * (`dispatchedAt`) and committed before the provider is called, and a claimed row with no outcome is never sent again.
 */
@Injectable()
export class MessageSendHandler implements OutboxHandler, OnModuleInit {
  readonly kind = MESSAGE_SEND;
  readonly retryDelaysMs = MESSAGE_RETRY_DELAYS_MS; // decision 5
  private readonly log = new Logger(MessageSendHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly registry: OutboxHandlers,
    private readonly links: AccountLinks,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    private readonly outbox: OutboxService,
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Pick<Env, "SMS_DAILY_PARTS_MAX">,
  ) {}

  onModuleInit() {
    this.registry.register(this);
    this.log.log(`SMS provider: ${this.sms.name}`); // which driver, never the key
  }

  async handle({ payload }: OutboxEnvelope): Promise<void> {
    const { messageId } = payload as { messageId: string };
    const now = this.clock.now();
    const open = nextSendingTime(now);

    const claim = await runInTransaction(this.prisma, async (tx): Promise<Claim> => {
      // B12 E9: the clinic's account row first, so this clinic's claims run one at a time and the month's count is exact.
      // Then the message (account → Message keeps the global order; B11's Message → PortalLink follows). Raw SQL: name the clinic.
      const clinicId = await lockAccount(tx);
      const [m] = await tx.$queryRaw<{ status: string; dispatchedAt: Date | null; to: string; body: string; kind: string; linkId: string | null; patientId: string; appointmentId: string | null }[]>`
        SELECT status, dispatchedAt, \`to\`, body, kind, linkId, patientId, appointmentId FROM Message WHERE id = ${messageId} AND clinicId = ${clinicId} FOR UPDATE`;
      if (!m || m.status !== "queued") return { skip: true }; // withdrawn, sent or failed already: a redelivery
      // Audit #24: a paused (suspended) clinic's template texts fail at once and are never sent later. Account texts still
      // go: a parent may need a reset while the clinic is paused.
      const { tier, status } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true, status: true } });
      if (status !== "active" && !isAccountText(m.kind)) {
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.clinicPaused }, select: { id: true } });
        await this.settled(tx, m);
        return { permanent: FAILURE.clinicPaused };
      }
      // Decision 4: a retry that lands at night waits, without spending a try. An invite or reset goes at any hour (B11 decision 12).
      if (open > now && !isAccountText(m.kind)) return { defer: open };
      if (m.dispatchedAt) {
        // A previous try reached the provider and never recorded an outcome (a crash, a timeout): don't risk a second text.
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.notConfirmed }, select: { id: true } });
        await this.settled(tx, m);
        return { skip: true };
      }
      const number = smsNumber(m.to);
      if (!number) {
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.noPhone }, select: { id: true } });
        await this.settled(tx, m);
        return { permanent: FAILURE.noPhone };
      }
      // B11 E5: the link is made now, inside the claim, and exists only in memory until the provider has it.
      const link = m.linkId ? await this.links.mint(tx, m.linkId) : undefined;
      if (m.linkId && !link) {
        await tx.message.update({ where: { id: messageId }, data: { status: "cancelled" }, select: { id: true } }); // used, cancelled or expired
        return { skip: true };
      }
      const body = link ? m.body.replace(LINK_MARK, link) : m.body;
      const parts = smsSegments(body);
      // B12 decisions 2, 3, 19: past the month's parts a template text fails and is never sent later; account texts always go.
      // Feature 16 (revised): the month's parts are the plan's plus that month's confirmed top-ups (textAllowance). A
      // confirm takes this same account lock, so a claim sees a top-up whole or not at all.
      const today = this.clock.today();
      const month = manilaMonth(today);
      const refused = textPartsRefusal(m.kind as LoggedMessageKind, await partsIn(tx, month), parts, await allowanceIn(tx, clinicId, tier, month), month);
      if (refused) {
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: refused }, select: { id: true } });
        await this.settled(tx, m);
        return { permanent: refused };
      }
      // Text-abuse limits: past the platform's daily cap a text waits for the next sending morning (no try spent) and the
      // alarm fires. Free texts pass, so a parent can still reset a password. A confirmation, reminder or pre-visit text
      // whose appointment starts by then is failed instead: it would arrive after the visit.
      if (!isFreeText(m.kind)) {
        const { used, cap } = await dailyCapState(tx, today, this.env.SMS_DAILY_PARTS_MAX);
        if (used + parts > cap) {
          this.metrics.countTextHeld();
          const tomorrow = nextSendingTime(addDays(new Date(`${today}T00:00:00+08:00`), 1));
          const visit = m.appointmentId && BEFORE_VISIT_KINDS.includes(m.kind)
            ? await tx.appointment.findFirst({ where: { id: m.appointmentId }, select: { startsAt: true } })
            : null;
          if (visit && visit.startsAt <= tomorrow) {
            this.log.warn(`Daily text cap reached (${used} of ${cap} parts): message ${messageId} failed, its appointment comes first`);
            await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.dailyCap }, select: { id: true } });
            await this.settled(tx, m);
            return { permanent: FAILURE.dailyCap };
          }
          this.log.warn(`Daily text cap reached (${used} of ${cap} parts): message ${messageId} waits for tomorrow`);
          return { defer: tomorrow };
        }
      }
      await tx.message.update({ where: { id: messageId }, data: { dispatchedAt: now, segments: parts }, select: { id: true } });
      return { send: { number, body, dispatchedAt: now, patientId: m.patientId, kind: m.kind } };
    });
    if ("defer" in claim) throw new OutboxDefer(claim.defer);
    if ("skip" in claim) return;
    if ("permanent" in claim) throw new OutboxPermanent(claim.permanent); // decision 12: no retries

    const mine = { id: messageId, status: "queued" as const, dispatchedAt: claim.send.dispatchedAt };
    // B14: a settled text changes the child's "no contact": the update and its standing.refresh row commit together.
    const settle = (data: Prisma.MessageUpdateManyMutationInput) => runInTransaction(this.prisma, async (tx) => {
      if ((await tx.message.updateMany({ where: mine, data })).count) await this.settled(tx, claim.send);
    });
    try {
      const receipt = await this.sms.send({ messageId, number: claim.send.number, body: claim.send.body });
      await settle({ status: "sent", sentAt: this.clock.now(), segments: receipt.segments, providerRef: receipt.providerRef });
    } catch (error) {
      if (error instanceof SmsInDoubt) {
        await settle({ status: "failed", failureReason: FAILURE.notConfirmed });
        return; // settled: the outbox row is done, nothing is retried (decision 13)
      }
      if (error instanceof SmsRejected) {
        await settle({ status: "failed", failureReason: FAILURE.rejected, segments: null }); // not sent: not counted (E9)
        throw new OutboxPermanent(FAILURE.rejected);
      }
      // Definitely not taken: release the claim so the retry may send (E3); it no longer counts toward the month (E9).
      await this.prisma.message.updateMany({ where: mine, data: { dispatchedAt: null, segments: null } });
      throw error;
    }
  }

  /** The tries ran out (decision 5): `failed` with the plain reason. A row already settled is left alone. */
  async deadLetter({ payload }: OutboxEnvelope, reason: string | undefined): Promise<void> {
    const { messageId } = payload as { messageId: string };
    await runInTransaction(this.prisma, async (tx) => {
      const failed = await tx.message.updateMany({ where: { id: messageId, status: "queued" }, data: { status: "failed", failureReason: reason ?? FAILURE.gaveUp, dispatchedAt: null, segments: null } });
      if (failed.count) await this.settled(tx, (await tx.message.findUniqueOrThrow({ where: { id: messageId }, select: { patientId: true, kind: true } })));
    });
  }

  /**
   * B14: a text went `sent` or `failed`, so the child's stored "no contact" may change. Queued in this transaction, never
   * refreshed here: this handler holds the account and the Message row, and taking the patient would reverse E8's order.
   * An account text never decides "no contact" (hasNoContact).
   */
  private async settled(tx: Tx, m: { patientId: string; kind: string }): Promise<void> {
    if (!isAccountText(m.kind)) await this.outbox.enqueue(tx, { kind: STANDING_REFRESH, payload: { patientId: m.patientId } });
  }
}
