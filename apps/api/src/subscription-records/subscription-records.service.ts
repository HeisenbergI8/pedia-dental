import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  RECEIPT_RULES, ReceiptUploadInput, billedTier, downgradeProblem, isTierUpgrade, keptPrice, nextBoundary,
  primolarInvoiceNo, settleStep, subscriptionDueOn, subscriptionMonthLine, subscriptionStatus, unpaidFrom, vatPart,
  type AccountStatus, type AmountDue, type ConfirmReceiptInput, type RecordUpfrontPaymentInput, type Subscription,
  type SubscriptionPayment, type SubscriptionView, type Tier, type UpfrontPayment,
} from "@pedia/shared";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { Clock } from "../common/clock";
import { currentContext, requestContext } from "../common/request-context";
import { countUsage } from "../clinic/limits";
import { isDuplicateKey } from "../idempotency/idempotency.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { AuditService } from "../audit/audit.service";
import { ALREADY_CHECKED, ReceiptRecordsService } from "../receipt-records/receipt-records.service";
import { readImageForm } from "../storage/image-form";
import { PlatformFilesService } from "../storage/platform-files.service";
import { LINE_COLUMNS, PAYMENT_COLUMNS, lineRows, paymentRow, subscriptionPatch, toSubscription, toSubscriptionPayment } from "./subscription.rows";

type Db = Tx | PrismaService;
type Account = { tier: Tier; status: AccountStatus };

export const CANCELLED_NO_PAYMENTS = "This subscription is cancelled, so Primolar records no more payments for it.";
export const MONTH_ALREADY_PAID = "This month is already paid.";
const CANCELLED_NO_RECEIPTS = "This subscription is cancelled, so Primolar takes no more payments for it.";
const RECEIPT_MONTH_PAID = "This month is already paid. Reject the receipt if it was sent twice.";
const AMOUNT_CHANGED = "The amount due has changed since this receipt was sent. Reject it and ask for a new one.";
const PAGE = 200;

/** Runs `fn` as this clinic: inside a request (the operator's, sign-in's) or a job (no context yet). */
const asClinic = <T>(clinicId: string, fn: () => Promise<T>): Promise<T> =>
  currentContext() ? requestContext.within({ clinicId }, fn) : requestContext.run({ requestId: `clinic:${clinicId}`, clinicId, operator: false }, async () => await fn());

/**
 * Primolar's monthly subscriptions (billing #25–#33, B12): the only reader and writer of Subscription,
 * SubscriptionPayment, SubscriptionLine and InvoiceCounter. Every write takes the clinic's account row, then its
 * subscription (E6); the invoice counter is always the last lock. Platform tables: every query names clinicId.
 */
@Injectable()
export class SubscriptionRecordsService {
  private readonly log = new Logger(SubscriptionRecordsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: PlatformSettingsService,
    private readonly receipts: ReceiptRecordsService,
    private readonly files: PlatformFilesService,
    private readonly audit: AuditService,
  ) {}

  /** E6's account lock by id (the operator and the jobs name the clinic; a clinic request has it in context). */
  async lockAccount(tx: Tx, clinicId: string): Promise<Account> {
    await tx.$queryRaw`SELECT id FROM ClinicAccount WHERE id = ${clinicId} FOR UPDATE`;
    const account = await tx.clinicAccount.findUnique({ where: { id: clinicId }, select: { tier: true, status: true } });
    if (!account) throw new NotFoundException("Clinic account not found");
    return account;
  }

  async lock(tx: Tx, clinicId: string): Promise<void> {
    await tx.$queryRaw`SELECT clinicId FROM Subscription WHERE clinicId = ${clinicId} FOR UPDATE`;
  }

  /** The subscription with its payments, oldest first; undefined for a clinic without one. */
  async read(db: Db, clinicId: string): Promise<Subscription | undefined> {
    const row = await db.subscription.findUnique({ where: { clinicId } });
    if (!row) return undefined;
    const payments = await db.subscriptionPayment.findMany({ where: { clinicId }, orderBy: [{ periodStart: "asc" }, { id: "asc" }], select: PAYMENT_COLUMNS });
    const lines = await db.subscriptionLine.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } }, select: LINE_COLUMNS });
    return toSubscription(row, payments.map((p) => toSubscriptionPayment(p, lines.filter((l) => l.paymentId === p.id))));
  }

  private async mustRead(db: Db, clinicId: string): Promise<Subscription> {
    const sub = await this.read(db, clinicId);
    if (!sub) throw new NotFoundException("Clinic account not found");
    return sub;
  }

  /** S10: one gapless sequence across the platform. Always the last lock of its transaction (E6). */
  async nextInvoiceNo(tx: Tx): Promise<string> {
    const [row] = await tx.$queryRaw<{ next: number | bigint }[]>`SELECT next FROM InvoiceCounter WHERE id = 'primolar' FOR UPDATE`;
    const next = Number(row?.next ?? 1);
    await tx.$executeRaw`INSERT INTO InvoiceCounter (id, next) VALUES ('primolar', ${next + 1}) ON DUPLICATE KEY UPDATE next = ${next + 1}`;
    return primolarInvoiceNo(next);
  }

  /**
   * Billing #24, #26, S12, S13: a new clinic's subscription anchored today, its upfront payment as its first invoice
   * (setup fee, first month, design add-on). In ClinicFactory's transaction; the caller checked the payment.
   */
  async start(tx: Tx, s: { clinicId: string; tier: Tier; quote: AmountDue; payment: UpfrontPayment }): Promise<void> {
    const anchor = this.clock.today();
    const lines = [
      { label: "Setup fee", amount: s.quote.setupFee },
      { label: "First month", amount: s.quote.firstMonth },
      ...(s.quote.designAddOn ? [{ label: "Design it for me", amount: s.quote.designAddOn }] : []),
    ];
    await tx.subscription.create({ data: { clinicId: s.clinicId, anchor: new Date(`${anchor}T00:00:00.000Z`), paidMonths: 1 }, select: { clinicId: true } });
    const payment: SubscriptionPayment = {
      ...s.payment, id: randomUUID(), invoiceNo: await this.nextInvoiceNo(tx), tier: s.tier, periodStart: anchor, periodEnd: subscriptionDueOn(anchor, 1), lines,
    };
    await this.insertPayment(tx, s.clinicId, payment, null);
  }

  private async insertPayment(tx: Tx, clinicId: string, p: SubscriptionPayment, receiptId: string | null): Promise<void> {
    try {
      await tx.subscriptionPayment.create({ data: paymentRow(clinicId, p, receiptId), select: { id: true } });
    } catch (error) {
      if (isDuplicateKey(error)) throw new ConflictException(MONTH_ALREADY_PAID); // @@unique([clinicId, periodStart]): the race backstop
      throw error;
    }
    await tx.subscriptionLine.createMany({ data: lineRows(p) });
  }

  /** S14: what the Owner and the console both see. Newest payment first. Every date is the server's. */
  async view(clinicId: string, db: Db = this.prisma): Promise<SubscriptionView> {
    const sub = await this.mustRead(db, clinicId);
    const account = await db.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true, name: true, tin: true, contactEmail: true } });
    const today = this.clock.today();
    const { state, nextDue, payBy, daysUntilDue } = subscriptionStatus(sub, today);
    const nextTier = billedTier(sub, account.tier);
    const nextAmount = await this.settings.monthlyFee(nextTier, nextDue, db);
    return {
      clinicId,
      billedTo: { name: account.name, tin: account.tin, contactEmail: account.contactEmail },
      tier: account.tier,
      nextTier,
      downgrade: sub.downgrade ?? null,
      state,
      nextDue,
      payBy,
      daysUntilDue,
      nextAmount,
      nextVat: vatPart(nextAmount),
      cancelledAt: sub.cancelledAt ?? null,
      pausedFor: sub.pause ?? null,
      payments: [...sub.payments].reverse(),
      receipts: await this.receipts.ofClinic(clinicId, db),
      paymentQr: await this.settings.qr(db),
      today,
    };
  }

  /** The step that settles one clinic, in the caller's transaction after both locks (E5: the shared settleStep). */
  private async settleIn(tx: Tx, clinicId: string, account: Account): Promise<void> {
    const sub = await this.read(tx, clinicId);
    if (!sub) return;
    const patch = settleStep(sub, account, this.clock.today());
    if (patch.tier || patch.status) {
      await tx.clinicAccount.update({ where: { id: clinicId }, data: { ...(patch.tier && { tier: patch.tier }), ...(patch.status && { status: patch.status }) }, select: { id: true } });
    }
    const data = subscriptionPatch(patch);
    if (Object.keys(data).length) await tx.subscription.update({ where: { clinicId }, data, select: { clinicId: true } });
    if (Object.keys(patch).length) this.log.log({ clinicId, patch: Object.keys(patch) }, "Subscription settled");
  }

  /** S2 (decision 4): applies a downgrade whose date has come and pauses a lapsed or ended clinic. Idempotent. */
  async settle(clinicId: string): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      const account = await tx.$queryRaw<Account[]>`SELECT tier, status FROM ClinicAccount WHERE id = ${clinicId} FOR UPDATE`;
      if (!account[0]) return;
      await this.lock(tx, clinicId);
      await this.settleIn(tx, clinicId, account[0]);
    });
  }

  /** The nightly job: every subscription by cursor, one transaction each; a failure is logged and the loop goes on. */
  async settleAll(): Promise<number> {
    let cursor: string | undefined;
    let settled = 0;
    for (;;) {
      const page = await this.prisma.subscription.findMany({ select: { clinicId: true }, orderBy: { clinicId: "asc" }, take: PAGE, ...(cursor ? { cursor: { clinicId: cursor }, skip: 1 } : {}) });
      for (const { clinicId } of page) {
        try {
          await this.settle(clinicId);
          settled++;
        } catch (error) {
          this.log.error(`Settling ${clinicId} failed (${error instanceof Error ? error.name : "Error"})`);
        }
      }
      if (page.length < PAGE) return settled;
      cursor = page.at(-1)!.clinicId;
    }
  }

  /**
   * Billing #29, S5: the first unpaid month at the fee for the plan it is billed at (decision 11: the list in force when
   * it began). Moves the schedule by one month, never by the date paid; lifts this subscription's own overdue pause once
   * back within grace. The caller holds the account and subscription locks.
   */
  async recordPayment(tx: Tx, clinicId: string, account: Account, input: RecordUpfrontPaymentInput, receiptId: string | null = null): Promise<void> {
    const sub = await this.mustRead(tx, clinicId);
    if (sub.cancelledAt) throw new ConflictException(CANCELLED_NO_PAYMENTS);
    const periodStart = unpaidFrom(sub);
    const tier = billedTier(sub, account.tier, periodStart);
    const amount = await this.settings.monthlyFee(tier, periodStart, tx);
    const paidMonths = sub.paidMonths + 1;
    const lifts = sub.pause === "overdue" && subscriptionStatus({ ...sub, paidMonths }, this.clock.today()).state !== "lapsed";
    await tx.subscription.update({ where: { clinicId }, data: { paidMonths, ...(lifts && { pause: null }) }, select: { clinicId: true } });
    if (lifts) await tx.clinicAccount.update({ where: { id: clinicId }, data: { status: "active" }, select: { id: true } });
    const invoiceNo = await this.nextInvoiceNo(tx); // the counter is the last lock (E6)
    await this.insertPayment(tx, clinicId, {
      ...input, id: randomUUID(), invoiceNo, tier, periodStart, periodEnd: subscriptionDueOn(sub.anchor, paidMonths),
      lines: [{ label: subscriptionMonthLine(tier, periodStart), amount }], amount, recordedAt: this.clock.now().toISOString(),
    }, receiptId);
  }

  /** POST /operator/accounts/:id/subscription/payments: one month marked by hand (201 view). */
  async recordByHand(clinicId: string, input: RecordUpfrontPaymentInput): Promise<SubscriptionView> {
    await runInTransaction(this.prisma, async (tx) => {
      const account = await this.lockAccount(tx, clinicId);
      await this.lock(tx, clinicId);
      await this.recordPayment(tx, clinicId, account, input);
    });
    return this.view(clinicId);
  }

  /**
   * Billing #27, S6, B12 decision 12: an upgrade now (the running months keep their price); a downgrade on the next due
   * date, refused while the clinic has more than the smaller plan allows; the current plan drops a waiting downgrade.
   */
  async changePlan(clinicId: string, tier: Tier): Promise<void> {
    await asClinic(clinicId, () =>
      runInTransaction(this.prisma, async (tx) => {
        const account = await this.lockAccount(tx, clinicId);
        await this.lock(tx, clinicId);
        const sub = await this.mustRead(tx, clinicId);
        if (sub.cancelledAt) throw new ConflictException("This subscription is cancelled, so its plan no longer changes.");
        const boundary = nextBoundary(sub, this.clock.today());
        if (isTierUpgrade(account.tier, tier)) {
          const kept = keptPrice(sub, account.tier, boundary);
          await tx.clinicAccount.update({ where: { id: clinicId }, data: { tier }, select: { id: true } });
          await tx.subscription.update({
            where: { clinicId },
            data: { downgradeTier: null, downgradeOn: null, ...(kept && { priceTier: kept.tier, priceTierUntil: new Date(`${kept.until}T00:00:00.000Z`) }) },
            select: { clinicId: true },
          });
          return;
        }
        if (tier === account.tier) {
          await tx.subscription.update({ where: { clinicId }, data: { downgradeTier: null, downgradeOn: null }, select: { clinicId: true } });
          return;
        }
        const over = downgradeProblem(tier, await countUsage(tx)); // under the account lock: branches and logins can't move
        if (over) throw new ConflictException(over);
        await tx.subscription.update({ where: { clinicId }, data: { downgradeTier: tier, downgradeOn: new Date(`${boundary}T00:00:00.000Z`) }, select: { clinicId: true } });
      }),
    );
  }

  /** Billing #30, S7: the clinic pauses when the paid month ends (at once if it already has). Nothing is deleted. */
  async cancel(clinicId: string): Promise<SubscriptionView> {
    await runInTransaction(this.prisma, async (tx) => {
      const account = await this.lockAccount(tx, clinicId);
      await this.lock(tx, clinicId);
      const sub = await this.mustRead(tx, clinicId);
      if (sub.cancelledAt) throw new ConflictException("This subscription is already cancelled.");
      await tx.subscription.update({ where: { clinicId }, data: { cancelledAt: this.clock.now(), downgradeTier: null, downgradeOn: null }, select: { clinicId: true } });
      await this.settleIn(tx, clinicId, account);
    });
    return this.view(clinicId);
  }

  /** S3: why the operator's Reactivate can't work now (the next settle would pause it again). Under both locks. */
  async reactivateRefusal(tx: Tx, clinicId: string): Promise<string | undefined> {
    const sub = await this.read(tx, clinicId);
    const state = sub && subscriptionStatus(sub, this.clock.today()).state;
    if (state === "lapsed") return "This clinic's Primolar payment is past its grace period. Record the payment to reactivate it.";
    if (state === "ended") return "This clinic's subscription is cancelled and its paid month has ended.";
    return undefined;
  }

  /** A manual reactivation also clears a subscription pause. */
  async forgetPause(tx: Tx, clinicId: string): Promise<void> {
    await tx.subscription.updateMany({ where: { clinicId }, data: { pause: null } });
  }

  /** E13: the plan a waiting downgrade goes to, for the limit checks (after lockAccount: account → subscription). */
  async waitingDowngrade(tx: Tx, clinicId: string): Promise<{ tier: Tier } | null> {
    const row = await tx.subscription.findUnique({ where: { clinicId }, select: { downgradeTier: true } });
    return row?.downgradeTier ? { tier: row.downgradeTier } : null;
  }

  /** B12 decision 25: an account paused by its own unpaid subscription (not by hand, not a cancellation). */
  async pausedForPayment(clinicId: string, db: Db = this.prisma): Promise<boolean> {
    const row = await db.subscription.findUnique({ where: { clinicId }, select: { pause: true } });
    return row?.pause === "overdue";
  }

  /**
   * POST /clinic/subscription/receipts (decisions 6, 21): the receipt for the first unpaid month, at what that month
   * costs now. Stored before the transaction; removed if the transaction refuses.
   */
  async addReceipt(clinicId: string, req: Request): Promise<SubscriptionView> {
    const form = await readImageForm(req, ReceiptUploadInput, RECEIPT_RULES, true);
    try {
      const file = form.file!;
      const key = await this.files.putFile("receipts", file.ext, file);
      await this.files.keepIf([key], () =>
        runInTransaction(this.prisma, async (tx) => {
          const account = await this.lockAccount(tx, clinicId);
          await this.lock(tx, clinicId);
          const sub = await this.mustRead(tx, clinicId);
          if (sub.cancelledAt) throw new ConflictException(CANCELLED_NO_RECEIPTS);
          const periodStart = unpaidFrom(sub);
          const amountDue = await this.settings.monthlyFee(billedTier(sub, account.tier), periodStart, tx);
          await this.receipts.add(tx, { payer: { kind: "subscription", clinicId }, reference: form.data.reference, amountDue, periodStart, fileKey: key, bytes: file.bytes });
          await this.audit.record("create", "Primolar payment receipt", undefined, tx); // as the mock's rule records it
        }),
      );
      return this.view(clinicId);
    } finally {
      await form.dispose();
    }
  }

  /**
   * Decisions 6, 22: confirms the full amount due for the month it was sent for, recording that month's payment (which
   * lifts an overdue pause). Locks: account → subscription → receipt → (payment) → invoice counter.
   */
  async confirmReceipt(clinicId: string, receiptId: string, input: ConfirmReceiptInput): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      const account = await this.lockAccount(tx, clinicId);
      await this.lock(tx, clinicId);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      const sub = await this.mustRead(tx, clinicId);
      if (sub.cancelledAt) throw new ConflictException(CANCELLED_NO_PAYMENTS);
      const periodStart = unpaidFrom(sub);
      if (receipt.periodStart?.toISOString().slice(0, 10) !== periodStart) throw new ConflictException(RECEIPT_MONTH_PAID);
      if (receipt.amountDue !== (await this.settings.monthlyFee(billedTier(sub, account.tier), periodStart, tx))) throw new ConflictException(AMOUNT_CHANGED);
      await this.recordPayment(tx, clinicId, account, { ...input, reference: receipt.reference }, receiptId);
      await this.receipts.decide(tx, receiptId, { status: "confirmed" });
    });
  }

  /** Decision 6: the reason the Owner reads; they can send a new one (21). Same locks as a confirm. */
  async rejectReceipt(clinicId: string, receiptId: string, reason: string): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      await this.lockAccount(tx, clinicId);
      await this.lock(tx, clinicId);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      await this.receipts.decide(tx, receiptId, { status: "rejected", reason });
    });
  }
}
