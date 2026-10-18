import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { FAILURE, LINK_MARK, MESSAGE_RETRY_DELAYS_MS, TIER_LIMITS, isAccountText, manilaMonth, nextSendingTime, smsNumber, smsSegments, textPartsRefusal, type LoggedMessageKind } from "@pedia/shared";
import { addMonths, format, parseISO } from "date-fns";
import { lockAccount } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { OutboxDefer, type OutboxEnvelope, type OutboxHandler, OutboxHandlers, OutboxPermanent } from "../outbox/outbox.handlers";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { AccountLinks } from "./account-links";
import { MESSAGE_SEND } from "./message.rows";
import { SMS_PROVIDER, SmsInDoubt, SmsRejected, type SmsProvider } from "./sms-provider";

/** A Manila month's start and the next one's, as instants (B12 E9). */
const monthStart = (month: string) => new Date(`${month}-01T00:00:00+08:00`);
const nextMonth = (month: string) => format(addMonths(parseISO(`${month}-01`), 1), "yyyy-MM");

/** Billed parts this clinic handed to the provider in `month` (decision 18): the claims' `segments`, by `dispatchedAt`. */
export async function partsIn(tx: Tx, month: string): Promise<number> {
  const { _sum } = await tx.message.aggregate({ where: { dispatchedAt: { gte: monthStart(month), lt: monthStart(nextMonth(month)) } }, _sum: { segments: true } });
  return _sum.segments ?? 0;
}

type Claim = { send: { number: string; body: string; dispatchedAt: Date } } | { skip: true } | { permanent: string } | { defer: Date };

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
      const [m] = await tx.$queryRaw<{ status: string; dispatchedAt: Date | null; to: string; body: string; kind: string; linkId: string | null }[]>`
        SELECT status, dispatchedAt, \`to\`, body, kind, linkId FROM Message WHERE id = ${messageId} AND clinicId = ${clinicId} FOR UPDATE`;
      if (!m || m.status !== "queued") return { skip: true }; // withdrawn, sent or failed already: a redelivery
      // Decision 4: a retry that lands at night waits, without spending a try. An invite or reset goes at any hour (B11 decision 12).
      if (open > now && !isAccountText(m.kind)) return { defer: open };
      if (m.dispatchedAt) {
        // A previous try reached the provider and never recorded an outcome (a crash, a timeout): don't risk a second text.
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.notConfirmed }, select: { id: true } });
        return { skip: true };
      }
      const number = smsNumber(m.to);
      if (!number) {
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: FAILURE.noPhone }, select: { id: true } });
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
      const { tier } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
      const refused = textPartsRefusal(m.kind as LoggedMessageKind, await partsIn(tx, manilaMonth(this.clock.today())), parts, TIER_LIMITS[tier].textParts);
      if (refused) {
        await tx.message.update({ where: { id: messageId }, data: { status: "failed", failureReason: refused }, select: { id: true } });
        return { permanent: refused };
      }
      await tx.message.update({ where: { id: messageId }, data: { dispatchedAt: now, segments: parts }, select: { id: true } });
      return { send: { number, body, dispatchedAt: now } };
    });
    if ("defer" in claim) throw new OutboxDefer(claim.defer);
    if ("skip" in claim) return;
    if ("permanent" in claim) throw new OutboxPermanent(claim.permanent); // decision 12: no retries

    const mine = { id: messageId, status: "queued" as const, dispatchedAt: claim.send.dispatchedAt };
    try {
      const receipt = await this.sms.send({ messageId, number: claim.send.number, body: claim.send.body });
      await this.prisma.message.updateMany({ where: mine, data: { status: "sent", sentAt: this.clock.now(), segments: receipt.segments, providerRef: receipt.providerRef } });
    } catch (error) {
      if (error instanceof SmsInDoubt) {
        await this.prisma.message.updateMany({ where: mine, data: { status: "failed", failureReason: FAILURE.notConfirmed } });
        return; // settled: the outbox row is done, nothing is retried (decision 13)
      }
      if (error instanceof SmsRejected) {
        await this.prisma.message.updateMany({ where: mine, data: { status: "failed", failureReason: FAILURE.rejected, segments: null } }); // not sent: not counted (E9)
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
    await this.prisma.message.updateMany({ where: { id: messageId, status: "queued" }, data: { status: "failed", failureReason: reason ?? FAILURE.gaveUp, dispatchedAt: null, segments: null } });
  }
}
