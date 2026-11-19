import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  RECEIPT_RULES, TOPUP_PAUSED, TextTopUpInput, manilaMonth, textTopUpQuote,
  type ConfirmReceiptInput, type TextTopUp, type TextTopUpsView,
} from "@pedia/shared";
import type { Request } from "express";
import { AuditService } from "../audit/audit.service";
import { lockAccount, lockAccountById } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { ALREADY_CHECKED, ReceiptRecordsService } from "../receipt-records/receipt-records.service";
import { nextInvoiceNo } from "../subscription-records/invoice-counter";
import { readImageForm } from "../storage/image-form";
import { PlatformFilesService } from "../storage/platform-files.service";

type Db = Tx | PrismaService;
const NOT_FOUND = "Clinic account not found";

/**
 * Feature 16 (revised): paid text top-ups (the mock's mocks/text-topups.ts and addTopUpReceipt). The only reader and
 * writer of TextTopUp. A leaf over Prisma, receipts and the price list: the usage, the send claim, the subscription
 * view and the console import it, never the reverse. Locks: account → receipt → invoice counter (E6's order).
 */
@Injectable()
export class TextTopUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly files: PlatformFilesService,
    private readonly receipts: ReceiptRecordsService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Parts bought for a Manila month, per clinic, in one grouped query (the usage, the console, the send claim). */
  async partsIn(clinicIds: readonly string[], month: string, db: Db = this.prisma): Promise<Map<string, number>> {
    if (!clinicIds.length) return new Map();
    const rows = await db.textTopUp.groupBy({ by: ["clinicId"], where: { clinicId: { in: [...clinicIds] }, month }, _sum: { parts: true } });
    return new Map(rows.map((r) => [r.clinicId, r._sum.parts ?? 0]));
  }

  /** D10: the payment history's top-ups, newest first. */
  async forClinic(clinicId: string, db: Db = this.prisma): Promise<TextTopUp[]> {
    const rows = await db.textTopUp.findMany({ where: { clinicId }, orderBy: [{ recordedAt: "desc" }, { id: "desc" }] });
    return rows.map((r) => ({
      id: r.id, clinicId: r.clinicId, invoiceNo: r.invoiceNo, month: r.month, packs: r.packs, parts: r.parts, receiptId: r.receiptId,
      amount: r.amount, method: r.method as TextTopUp["method"], reference: r.reference ?? undefined,
      paidOn: r.paidOn.toISOString().slice(0, 10), recordedAt: r.recordedAt.toISOString(),
    }));
  }

  /** GET /clinic/text-topups. */
  async view(clinicId: string): Promise<TextTopUpsView> {
    const month = manilaMonth(this.clock.today());
    return {
      pack: (await this.settings.prices()).textPack,
      month,
      partsThisMonth: (await this.partsIn([clinicId], month)).get(clinicId) ?? 0,
      paymentQr: await this.settings.qr(),
      receipts: await this.receipts.topUpsOf(clinicId),
    };
  }

  /**
   * POST /clinic/text-topups/receipts: at today's pack price (D3), one waiting at a time (decision 21), never while the
   * clinic is paused by its subscription (D8). Stored before the transaction; removed if the transaction refuses.
   */
  async addReceipt(clinicId: string, req: Request): Promise<TextTopUpsView> {
    const form = await readImageForm(req, TextTopUpInput, RECEIPT_RULES, true);
    try {
      const file = form.file!;
      const key = await this.files.putFile("receipts", file.ext, file);
      await this.files.keepIf([key], () =>
        runInTransaction(this.prisma, async (tx) => {
          await lockAccount(tx); // the same account lock the operator's confirm and the send claim take first
          // D8: read the one column here (not SubscriptionRecordsService, which imports this service).
          if ((await tx.subscription.findUnique({ where: { clinicId }, select: { pause: true } }))?.pause) throw new ConflictException(TOPUP_PAUSED);
          const { parts, amount } = textTopUpQuote((await this.settings.prices(tx)).textPack, form.data.packs);
          await this.receipts.add(tx, {
            payer: { kind: "text_topup", clinicId }, reference: form.data.reference, amountDue: amount, periodStart: null,
            packs: form.data.packs, parts, fileKey: key, bytes: file.bytes,
          });
          await this.audit.record("create", "Text top-up receipt", undefined, tx); // as the mock's rule records it
        }),
      );
      return this.view(clinicId);
    } finally {
      await form.dispose();
    }
  }

  /** The operator's confirm: the receipt's own parts and amount (D3), to the Manila month of today (D7), on the books (D10). */
  async confirmReceipt(clinicId: string, receiptId: string, input: ConfirmReceiptInput): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      if (!(await lockAccountById(tx, clinicId))) throw new NotFoundException(NOT_FOUND);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      await tx.textTopUp.create({
        data: {
          clinicId, month: manilaMonth(this.clock.today()), packs: receipt.packs!, parts: receipt.parts!, amount: receipt.amountDue,
          method: input.method, paidOn: new Date(`${input.paidOn}T00:00:00.000Z`), reference: receipt.reference, receiptId,
          recordedAt: this.clock.now(), invoiceNo: await nextInvoiceNo(tx), // the counter is the last lock (E6)
        },
        select: { id: true },
      });
      await this.receipts.decide(tx, receiptId, { status: "confirmed" });
    });
  }

  /** Decision 6: the reason the Owner reads; they can send a new one (21). Same locks as a confirm. */
  async rejectReceipt(clinicId: string, receiptId: string, reason: string): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      if (!(await lockAccountById(tx, clinicId))) throw new NotFoundException(NOT_FOUND);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      await this.receipts.decide(tx, receiptId, { status: "rejected", reason });
    });
  }
}
