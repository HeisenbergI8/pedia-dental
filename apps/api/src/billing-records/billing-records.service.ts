import { Injectable } from "@nestjs/common";
import { receiptNo, type Appointment, type BillTotals, type FinanceFacts, type Invoice, type PaidRow, type Payment, type ReceiptSeries } from "@pedia/shared";
import { requireContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { StandingRefresh } from "../patients/standing-refresh";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import type { Tx } from "../prisma/transaction";
import { financeBounds, toCollected } from "./finance-facts";
import { INVOICE_COLUMNS, LINE_COLUMNS, PAYMENT_COLUMNS, PAYMENT_ORDER, invoiceRows, toInvoice, toPayment } from "./billing.rows";

/** Some patients' live bills as the shared money rules read them (E8). */
export type BillTotalsOf = { invoices: (BillTotals & { patientId: string })[]; payments: PaidRow[] };

export type NewPayment = Omit<Payment, "id" | "clinicId"> & { receiptLeg: number };

/**
 * The only reader and writer of Invoice, InvoiceLine, Payment and ReceiptCounter (E4), Prisma only, so billing,
 * patients and reports share one owner without a module cycle. Raw SQL names clinicId itself.
 */
@Injectable()
export class BillingRecordsService {
  constructor(private readonly prisma: PrismaService, private readonly standing: StandingRefresh) {}

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

  /**
   * Each live bill of these patients with its line sum and payment sum (E8): one aggregate query, shaped for the shared
   * rules (one line carrying the sum; one payment row per bill). Voided bills are left out, as accountSummary would.
   */
  async billTotals(patientIds: readonly string[], tx: Tx = this.prisma): Promise<BillTotalsOf> {
    if (!patientIds.length) return { invoices: [], payments: [] };
    const rows = await tx.$queryRaw<{ id: string; patientId: string; discount: number; billed: unknown; paid: unknown }[]>`
      SELECT i.id, i.patientId, i.discount,
        (SELECT COALESCE(SUM(l.amount), 0) FROM InvoiceLine l WHERE l.clinicId = i.clinicId AND l.invoiceId = i.id) AS billed,
        (SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.clinicId = i.clinicId AND p.invoiceId = i.id) AS paid
      FROM Invoice i
      WHERE i.clinicId = ${requireContext().clinicId!} AND i.voidedAt IS NULL AND i.patientId IN (${Prisma.join([...patientIds])})`;
    // SUM of INT is DECIMAL: the driver gives a string (CONVENTIONS → raw SQL numbers).
    return {
      invoices: rows.map((r) => ({ id: r.id, patientId: r.patientId, discount: Number(r.discount), lines: [{ amount: Number(r.billed) }] })),
      payments: rows.map((r) => ({ invoiceId: r.id, amount: Number(r.paid) })),
    };
  }

  /**
   * The dashboard's sums for these branches (B8 E7): six bounded aggregate queries, none returning a row per payment.
   * `done` is the branches' done appointments from unpaidSince(today) to today; summarizeFinance turns it all into
   * the report, so no dashboard rule is re-derived here. A bill's payments carry its branch (E11).
   */
  async financeFacts(branchIds: readonly string[], today: string, done: Pick<Appointment, "id" | "patientId" | "startsAt" | "reason">[]): Promise<FinanceFacts> {
    const clinicId = requireContext().clinicId!;
    const branches = Prisma.join([...branchIds]);
    const b = financeBounds(today);
    const [collected, revenue, discounts, balances, deposits, bills] = await Promise.all([
      // 1. Real money per Manila day and method. Manila is fixed UTC+8 (E7).
      this.prisma.$queryRaw<{ day: string; method: string; amount: unknown }[]>`
        SELECT DATE_FORMAT(DATE_ADD(receivedAt, INTERVAL 8 HOUR), '%Y-%m-%d') AS day, method, SUM(amount) AS amount
        FROM Payment
        WHERE clinicId = ${clinicId} AND branchId IN (${branches}) AND method <> 'account_credit'
          AND receivedAt >= ${b.collectedFrom} AND receivedAt < ${b.collectedEnd}
        GROUP BY day, method`,
      // 2. This month's live bills' lines, per procedure.
      this.prisma.$queryRaw<{ procedureCode: string; amount: unknown; count: unknown }[]>`
        SELECT l.procedureCode, SUM(l.amount) AS amount, COUNT(*) AS count
        FROM InvoiceLine l JOIN Invoice i ON i.clinicId = l.clinicId AND i.id = l.invoiceId
        WHERE i.clinicId = ${clinicId} AND i.branchId IN (${branches}) AND i.voidedAt IS NULL
          AND i.issuedAt >= ${b.monthFrom} AND i.issuedAt < ${b.end}
        GROUP BY l.procedureCode`,
      // 3. This month's discounts.
      this.prisma.$queryRaw<{ total: unknown }[]>`
        SELECT COALESCE(SUM(discount), 0) AS total FROM Invoice
        WHERE clinicId = ${clinicId} AND branchId IN (${branches}) AND voidedAt IS NULL AND issuedAt >= ${b.monthFrom} AND issuedAt < ${b.end}`,
      // 4. Balance per patient over live bills, all time.
      this.prisma.$queryRaw<{ patientId: string; balance: unknown }[]>`
        SELECT x.patientId, SUM(x.billed - x.discount - x.paid) AS balance FROM (
          SELECT i.patientId, i.discount,
            (SELECT COALESCE(SUM(l.amount), 0) FROM InvoiceLine l WHERE l.clinicId = i.clinicId AND l.invoiceId = i.id) AS billed,
            (SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.clinicId = i.clinicId AND p.invoiceId = i.id) AS paid
          FROM Invoice i WHERE i.clinicId = ${clinicId} AND i.branchId IN (${branches}) AND i.voidedAt IS NULL) x
        GROUP BY x.patientId`,
      // 5. Deposit rows per patient at these branches.
      this.prisma.$queryRaw<{ patientId: string; held: unknown }[]>`
        SELECT patientId, SUM(amount) AS held FROM Payment
        WHERE clinicId = ${clinicId} AND branchId IN (${branches}) AND invoiceId IS NULL GROUP BY patientId`,
      // 6. The done appointments' live bills, earliest first, with their balances.
      done.length
        ? this.prisma.$queryRaw<{ id: string; appointmentId: string; balance: unknown }[]>`
          SELECT i.id, i.appointmentId,
            (SELECT COALESCE(SUM(l.amount), 0) FROM InvoiceLine l WHERE l.clinicId = i.clinicId AND l.invoiceId = i.id) - i.discount
            - (SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.clinicId = i.clinicId AND p.invoiceId = i.id) AS balance
          FROM Invoice i
          WHERE i.clinicId = ${clinicId} AND i.branchId IN (${branches}) AND i.voidedAt IS NULL AND i.appointmentId IN (${Prisma.join(done.map((a) => a.id))})
          ORDER BY i.issuedAt, i.id`
        : Promise.resolve([]),
    ]);
    const first = new Map<string, { id: string; balance: number }>();
    for (const r of bills) if (!first.has(r.appointmentId)) first.set(r.appointmentId, { id: r.id, balance: Number(r.balance) });
    return {
      collected: toCollected(collected),
      revenue: revenue.map((r) => ({ procedureCode: r.procedureCode, amount: Number(r.amount), count: Number(r.count) })),
      discounts: Number(discounts[0]?.total ?? 0),
      balances: balances.map((r) => ({ patientId: r.patientId, balance: Number(r.balance) })),
      deposits: deposits.map((r) => ({ patientId: r.patientId, held: Number(r.held) })),
      done: done.map((a) => {
        const row = { appointmentId: a.id, patientId: a.patientId, startsAt: a.startsAt, reason: a.reason };
        const bill = first.get(a.id);
        return bill ? { ...row, invoiceId: bill.id, balance: bill.balance } : row;
      }),
    };
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
    await this.standing.refresh(tx, invoice.patientId, ["balance"]); // B14, under the patient's lock (B8 E1)
    return toInvoice(created, lines.map((l) => ({ ...l, invoiceId: created.id })));
  }

  /** Decision 2: marks it voided and frees its items (E6). The bill is already locked. */
  async voidInvoice(tx: Tx, id: string, v: { at: Date; by: string; reason: string }): Promise<Invoice> {
    await tx.invoice.updateMany({ where: { id }, data: { voidedAt: v.at, voidedBy: v.by, voidReason: v.reason } });
    await tx.invoiceLine.updateMany({ where: { invoiceId: id }, data: { livePlanItemId: null } });
    const voided = (await this.lockInvoice(tx, id))!;
    await this.standing.refresh(tx, voided.patientId, ["balance"]); // B14
    return voided;
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
    for (const patientId of new Set(rows.map((r) => r.patientId))) await this.standing.refresh(tx, patientId, ["balance"]); // B14, under the payer's lock
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
