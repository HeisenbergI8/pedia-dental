import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PaymentQrInput, PaymentQrView, PriceChange, PriceList, QR_RULES, monthlyFeeOn, type Tier } from "@pedia/shared";
import type { Request } from "express";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import type { PlatformSettings as SettingsRow, PriceChange as ChangeRow } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { deletePlatformFile } from "../storage/delete-file.handler";
import { readImageForm } from "../storage/image-form";
import { PlatformFilesService } from "../storage/platform-files.service";

const ID = "primolar";
type Db = Tx | PrismaService;
type Fees = Pick<SettingsRow, "smallSetupFee" | "smallMonthlyFee" | "midSetupFee" | "midMonthlyFee" | "bigSetupFee" | "bigMonthlyFee" | "designAddOn">;

const toList = (r: Fees): PriceList => ({
  plans: {
    small: { setupFee: r.smallSetupFee, monthlyFee: r.smallMonthlyFee },
    mid: { setupFee: r.midSetupFee, monthlyFee: r.midMonthlyFee },
    big: { setupFee: r.bigSetupFee, monthlyFee: r.bigMonthlyFee },
  },
  designAddOn: r.designAddOn,
});
const toFees = (l: PriceList): Fees => ({
  smallSetupFee: l.plans.small.setupFee, smallMonthlyFee: l.plans.small.monthlyFee, midSetupFee: l.plans.mid.setupFee,
  midMonthlyFee: l.plans.mid.monthlyFee, bigSetupFee: l.plans.big.setupFee, bigMonthlyFee: l.plans.big.monthlyFee, designAddOn: l.designAddOn,
});
const toChange = (r: ChangeRow): PriceChange => PriceChange.parse({ on: r.on.toISOString().slice(0, 10), before: toList(r) });
const sameList = (a: PriceList, b: PriceList) => JSON.stringify(toFees(a)) === JSON.stringify(toFees(b));

export const NO_QR_IMAGE = "Primolar hasn't added payment details yet";

/**
 * The price list and Primolar's payment QR (B12 decisions 5, 11, 23): the only reader and writer of PlatformSettings and
 * PriceChange. The settings row is also the platform lock (E6), the first lock of every transaction that takes it.
 */
@Injectable()
export class PlatformSettingsService {
  private readonly log = new Logger(PlatformSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly files: PlatformFilesService,
    private readonly outbox: OutboxService,
  ) {}

  /** E6: the first statement of a transaction that checks or writes platform-wide rules (prices, duplicate names). */
  async lockPlatform(tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM PlatformSettings WHERE id = ${ID} FOR UPDATE`;
  }

  async prices(db: Db = this.prisma): Promise<PriceList> {
    return toList(await db.platformSettings.findUniqueOrThrow({ where: { id: ID } }));
  }

  /** By day, oldest first: `priceOn` takes the first change after a day. One per day (savePrices). */
  async priceChanges(db: Db = this.prisma): Promise<PriceChange[]> {
    return (await db.priceChange.findMany({ orderBy: [{ on: "asc" }, { createdAt: "asc" }] })).map(toChange);
  }

  /** The month starting `periodStart` at the list in force that day (decision 11, the shared rule). */
  async monthlyFee(tier: Tier, periodStart: string, db: Db = this.prisma): Promise<number> {
    return monthlyFeeOn(await this.priceChanges(db), await this.prices(db), tier, periodStart);
  }

  /** PUT /operator/prices: a change keeps the list in force before today (decision 11). Waiting sign-ups keep their quote. */
  async savePrices(list: PriceList): Promise<PriceList> {
    const saved = await runInTransaction(this.prisma, async (tx) => {
      await this.lockPlatform(tx);
      const old = await this.prices(tx);
      if (sameList(old, list)) return old;
      // Only the first change of a day is kept: it already holds the list in force before that day, and every later
      // one the same day would only describe prices no month was billed at (priceOn reads `before` for days < on).
      const on = new Date(`${this.clock.today()}T00:00:00.000Z`);
      if (!(await tx.priceChange.findFirst({ where: { on }, select: { id: true } }))) {
        await tx.priceChange.create({ data: { on, ...toFees(old), createdAt: this.clock.now() }, select: { id: true } });
      }
      await tx.platformSettings.update({ where: { id: ID }, data: toFees(list), select: { id: true } });
      return list;
    });
    this.log.log({ operatorId: requireContext().operatorId }, "Price list saved"); // operator actions: ids only (no clinic trail)
    return saved;
  }

  async qr(db: Db = this.prisma): Promise<PaymentQrView | null> {
    const r = await db.platformSettings.findUniqueOrThrow({ where: { id: ID }, select: { paymentQrKey: true, paymentQrCaption: true, paymentQrUpdatedAt: true } });
    return r.paymentQrKey && r.paymentQrUpdatedAt ? PaymentQrView.parse({ caption: r.paymentQrCaption, updatedAt: r.paymentQrUpdatedAt.toISOString() }) : null;
  }

  /** PUT /operator/payment-qr (decision 5): a new image replaces the old one; a caption-only save keeps it. */
  async saveQr(req: Request): Promise<PaymentQrView> {
    const form = await readImageForm(req, PaymentQrInput, QR_RULES, false);
    try {
      const key = form.file && (await this.files.putFile("payment-qr", form.file.ext, form.file));
      await this.files.keepIf([key], () =>
        runInTransaction(this.prisma, async (tx) => {
          await this.lockPlatform(tx);
          const { paymentQrKey: old } = await tx.platformSettings.findUniqueOrThrow({ where: { id: ID }, select: { paymentQrKey: true } });
          if (!key && !old) throw new BadRequestException("Add the QR image");
          await tx.platformSettings.update({
            where: { id: ID },
            data: { paymentQrKey: key ?? old, paymentQrCaption: form.data.caption, paymentQrUpdatedAt: this.clock.now() },
            select: { id: true },
          });
          if (key && old) await this.outbox.enqueue(tx, deletePlatformFile(old));
        }),
      );
      this.log.log({ operatorId: requireContext().operatorId }, "Payment QR saved");
      return (await this.qr())!;
    } finally {
      await form.dispose();
    }
  }

  /** GET /signups/payment-qr/image: a 5-minute link to the QR, or undefined before there is one. */
  async qrLink(): Promise<string | undefined> {
    const { paymentQrKey } = await this.prisma.platformSettings.findUniqueOrThrow({ where: { id: ID }, select: { paymentQrKey: true } });
    return paymentQrKey ? this.files.link(paymentQrKey, { fileName: "primolar-payment-qr" }) : undefined;
  }
}
