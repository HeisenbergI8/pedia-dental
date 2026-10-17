import { Injectable } from "@nestjs/common";
import { receiptNo, type Invoice, type Payment, type ReceiptSeries } from "@pedia/shared";
import { requireContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import type { Tx } from "../prisma/transaction";
import { INVOICE_COLUMNS, LINE_COLUMNS, PAYMENT_COLUMNS, PAYMENT_ORDER, invoiceRows, toInvoice, toPayment } from "./billing.rows";

export type NewPayment = Omit<Payment, "id" | "clinicId"> & { receiptLeg: number };

/**
 * The only reader and writer of Invoice, InvoiceLine, Payment and ReceiptCounter (E4), Prisma only, so billing,
 * patients and reports share one owner without a module cycle. Raw SQL names clinicId itself.
 */
@Injectable()
export class BillingRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /** A patient's bills, oldest first, voided included. */
  async invoicesOf(patientId: string, db: Tx = this.prisma): Promise<Invoice[]> {
    const rows = await db.invoice.findMany({ where: { patientId }, select: INVOICE_COLUMNS, orderBy: [{ issuedAt: "asc" }, { id: "asc" }] });
    const lines = rows.length ? await db.invoiceLine.findMany({ where: { invoiceId: { in: rows.map((r) => r.id) } }, select: LINE_COLUMNS }) : [];
    return rows.map((r) => toInvoice(r, lines.filter((l) => l.invoiceId === r.id)));
  }

  /** A patient's payments in the mock's order. */
  async paymentsOf(patientId: string): Promise<Payment[]> {
    return (await this.prisma.payment.findMany({ where: { patientId }, select: PAYMENT_COLUMNS, orderBy: PAYMENT_ORDER })).map(toPayment);
  }

  /** Payments received in [from, to) at these branches, oldest first (the day's collections). */
  async paymentsBetween(branchIds: readonly string[], from: Date, to: Date): Promise<Payment[]> {
    const rows = await this.prisma.payment.findMany({
      where: { branchId: { in: [...branchIds] }, receivedAt: { gte: from, lt: to } }, select: PAYMENT_COLUMNS, orderBy: PAYMENT_ORDER,
    });
    return rows.map(toPayment);
  }

  /** The bill's patient, read outside the transaction (B6 decision 3: it never changes). Undefined → 404. */
  async patientOfInvoice(id: string): Promise<string | undefined> {
    return (await this.prisma.invoice.findFirst({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** Locks one bill (after the patient, E1) and returns it with its lines. */
  async lockInvoice(tx: Tx, id: string): Promise<Invoice | undefined> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Invoice WHERE clinicId = ${requireContext().clinicId!} AND id = ${id} FOR UPDATE`;
    if (!locked.length) return undefined;
    const row = await tx.invoice.findFirst({ where: { id }, select: INVOICE_COLUMNS });
    return toInvoice(row!, await tx.invoiceLine.findMany({ where: { invoiceId: id }, select: LINE_COLUMNS }));
  }

  /** What's on a bill: every row, and the deposit credit among them; the row count for the void rule. */
  async paidOn(tx: Tx, invoiceId: string): Promise<{ all: number; credit: number; rows: number }> {
    const [all, credit] = await Promise.all([
      tx.payment.aggregate({ where: { invoiceId }, _sum: { amount: true }, _count: true }),
      tx.payment.aggregate({ where: { invoiceId, method: "account_credit" }, _sum: { amount: true } }),
    ]);
    return { all: all._sum.amount ?? 0, credit: credit._sum.amount ?? 0, rows: all._count };
  }

  /** A patient's deposit-side rows, in received order (depositBalance, depositPool). One family's rows. */
  async depositRows(tx: Tx, patientId: string) {
    const rows = await tx.payment.findMany({
      where: { patientId, invoiceId: null }, select: { patientId: true, invoiceId: true, appliedTo: true, branchId: true, amount: true }, orderBy: PAYMENT_ORDER,
    });
    return rows.map((r) => ({ ...r, invoiceId: r.invoiceId ?? undefined, appliedTo: r.appliedTo ?? undefined }));
  }

  /** A new bill and its lines, after the locks (the read-back is safe there). */
  async createInvoice(tx: Tx, invoice: Omit<Invoice, "id" | "clinicId">): Promise<Invoice> {
    const { invoice: row, lines } = invoiceRows({ ...invoice, id: "", clinicId: "" });
    const { id: _, ...data } = row;
    const created = await tx.invoice.create({ data: { ...clinicData(), ...data }, select: INVOICE_COLUMNS });
    await tx.invoiceLine.createMany({ data: lines.map((l) => ({ ...clinicData(), ...l, invoiceId: created.id })) });
    return toInvoice(created, lines.map((l) => ({ ...l, invoiceId: created.id })));
  }

  /** Decision 2: marks it voided and frees its items (E6). The bill is already locked. */
  async voidInvoice(tx: Tx, id: string, v: { at: Date; by: string; reason: string }): Promise<Invoice> {
    await tx.invoice.updateMany({ where: { id }, data: { voidedAt: v.at, voidedBy: v.by, voidReason: v.reason } });
    await tx.invoiceLine.updateMany({ where: { invoiceId: id }, data: { livePlanItemId: null } });
    return (await this.lockInvoice(tx, id))!;
  }

  /** Inserts rows one by one (createMany returns nothing on MySQL); returns them in order. */
  async addPayments(tx: Tx, rows: NewPayment[]): Promise<Payment[]> {
    const out: Payment[] = [];
    for (const r of rows) {
      out.push(toPayment(await tx.payment.create({
        data: {
          ...clinicData(), branchId: r.branchId, patientId: r.patientId, invoiceId: r.invoiceId ?? null, appliedTo: r.appliedTo ?? null, amount: r.amount,
          method: r.method, referenceNo: r.referenceNo ?? null, note: r.note ?? null, receiptNo: r.receiptNo, receiptLeg: r.receiptLeg,
          receivedBy: r.receivedBy, receivedAt: new Date(r.receivedAt),
        },
        select: PAYMENT_COLUMNS,
      })));
    }
    return out;
  }

  /**
   * The clinic's next number in a series (E3): the increment holds the counter's row lock until commit, so parallel
   * payments number one after another, and a rollback gives the number back. Always the last lock taken.
   */
  async nextReceipt(tx: Tx, series: ReceiptSeries): Promise<string> {
    const clinicId = requireContext().clinicId!;
    await tx.$executeRaw`INSERT INTO ReceiptCounter (clinicId, series, last) VALUES (${clinicId}, ${series}, 1) ON DUPLICATE KEY UPDATE last = last + 1`;
    const [row] = await tx.$queryRaw<{ last: number | bigint }[]>`SELECT last FROM ReceiptCounter WHERE clinicId = ${clinicId} AND series = ${series}`;
    return receiptNo(series, Number(row!.last));
  }
}
