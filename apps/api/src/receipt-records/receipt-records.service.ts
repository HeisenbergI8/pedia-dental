import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { RECEIPT_PENDING, type ReceiptPayer, type ReceiptToCheck, type ReceiptView } from "@pedia/shared";
import { Clock } from "../common/clock";
import type { ReceiptStatus } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";
import { PlatformFilesService } from "../storage/platform-files.service";
import { RECEIPT_COLUMNS, payerOf, payerWhere, toReceiptToCheck, toReceiptView, type ReceiptColumns } from "./receipt.rows";

export const RECEIPT_NOT_FOUND = "Receipt not found";
export const ALREADY_CHECKED = "This receipt has already been checked";

export type NewReceipt = { payer: ReceiptPayer; reference: string; amountDue: number; periodStart: string | null; fileKey: string; bytes: number };

/**
 * The receipts clinics and sign-ups send after paying by QR (B12 decisions 6–8, 21–24): the only reader and writer of
 * PaymentReceipt. Callers lock the payer first (account → subscription, or the sign-up), then the receipt (E6).
 */
@Injectable()
export class ReceiptRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly files: PlatformFilesService,
  ) {}

  /** Decision 21: one receipt waits at a time. Called under the payer's lock, so two uploads can't both pass. */
  async add(tx: Tx, r: NewReceipt): Promise<void> {
    if (await tx.paymentReceipt.findFirst({ where: { ...payerWhere(r.payer), status: "pending" }, select: { id: true } })) throw new ConflictException(RECEIPT_PENDING);
    await tx.paymentReceipt.create({
      data: {
        purpose: r.payer.kind, signupId: r.payer.kind === "signup" ? r.payer.signupId : null, clinicId: r.payer.kind === "subscription" ? r.payer.clinicId : null,
        periodStart: r.periodStart ? new Date(`${r.periodStart}T00:00:00.000Z`) : null, amountDue: r.amountDue, reference: r.reference,
        fileKey: r.fileKey, bytes: r.bytes, uploadedAt: this.clock.now(), status: "pending",
      },
      select: { id: true },
    });
  }

  /** The receipt, locked for its decision (after its payer's lock). 404 when there is none. */
  async lock(tx: Tx, id: string): Promise<ReceiptColumns & { payer: ReceiptPayer }> {
    await tx.$queryRaw`SELECT id FROM PaymentReceipt WHERE id = ${id} FOR UPDATE`;
    const row = await tx.paymentReceipt.findUnique({ where: { id }, select: RECEIPT_COLUMNS });
    if (!row) throw new NotFoundException(RECEIPT_NOT_FOUND);
    return { ...row, payer: payerOf(row) };
  }

  /** Whom a receipt is from, read before any lock: a receipt's payer never changes. 404 when there is none. */
  async payer(id: string): Promise<ReceiptPayer> {
    const row = id.length <= 191 ? await this.prisma.paymentReceipt.findUnique({ where: { id }, select: { purpose: true, signupId: true, clinicId: true } }) : null;
    if (!row) throw new NotFoundException(RECEIPT_NOT_FOUND);
    return payerOf(row);
  }

  /** Decision 22: confirmed or rejected, once. The caller checked it is pending under the lock. */
  async decide(tx: Tx, id: string, decision: { status: Exclude<ReceiptStatus, "pending">; reason?: string }): Promise<void> {
    await tx.paymentReceipt.update({ where: { id }, data: { status: decision.status, rejectionReason: decision.reason ?? null, decidedAt: this.clock.now() }, select: { id: true } });
  }

  /** Rejecting a sign-up rejects its waiting receipt too (the mock's rejectSignupReceipts). */
  async rejectPendingOf(tx: Tx, payer: ReceiptPayer, reason: string): Promise<void> {
    await tx.paymentReceipt.updateMany({ where: { ...payerWhere(payer), status: "pending" }, data: { status: "rejected", rejectionReason: reason, decidedAt: this.clock.now() } });
  }

  /** Newest first. */
  async latestFor(payer: ReceiptPayer): Promise<ReceiptView | null> {
    const row = await this.prisma.paymentReceipt.findFirst({ where: payerWhere(payer), orderBy: [{ uploadedAt: "desc" }, { id: "desc" }], select: RECEIPT_COLUMNS });
    return row ? toReceiptView(row) : null;
  }

  /** A clinic's receipts, newest first (Settings → Plan and the console's subscription card). */
  async ofClinic(clinicId: string, db: Tx | PrismaService = this.prisma): Promise<ReceiptView[]> {
    const rows = await db.paymentReceipt.findMany({ where: payerWhere({ kind: "subscription", clinicId }), orderBy: [{ uploadedAt: "desc" }, { id: "desc" }], select: RECEIPT_COLUMNS });
    return rows.map(toReceiptView);
  }

  /** Decision 8: Payments to check, pending only, oldest first, with whom each is from (one query per kind: no N+1). */
  async pending(): Promise<ReceiptToCheck[]> {
    const rows = await this.prisma.paymentReceipt.findMany({ where: { status: "pending" }, orderBy: [{ uploadedAt: "asc" }, { id: "asc" }], select: RECEIPT_COLUMNS });
    const clinicIds = [...new Set(rows.flatMap((r) => (r.clinicId ? [r.clinicId] : [])))];
    const signupIds = [...new Set(rows.flatMap((r) => (r.signupId ? [r.signupId] : [])))];
    // Read-only names, one column each: this module stays a leaf (as MessageQueueService's renders, B9 E1).
    const clinics = new Map((await this.prisma.clinicAccount.findMany({ where: { id: { in: clinicIds } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
    const signups = new Map(
      (await this.prisma.signup.findMany({ where: { id: { in: signupIds } }, select: { id: true, reference: true, name: true } })).map((s) => [s.id, { reference: s.reference, name: s.name }]),
    );
    return rows.map((r) => toReceiptToCheck(r, { clinics, signups }));
  }

  /** The receipt as Payments to check shows it, after a decision. */
  async toCheck(id: string): Promise<ReceiptToCheck> {
    const row = await this.prisma.paymentReceipt.findUniqueOrThrow({ where: { id }, select: RECEIPT_COLUMNS });
    const clinics = new Map(row.clinicId ? [[row.clinicId, (await this.prisma.clinicAccount.findUnique({ where: { id: row.clinicId }, select: { name: true } }))?.name ?? ""]] : []);
    const signup = row.signupId ? await this.prisma.signup.findUnique({ where: { id: row.signupId }, select: { reference: true, name: true } }) : null;
    const signups = new Map(signup ? [[row.signupId!, signup]] : []);
    return toReceiptToCheck(row, { clinics, signups });
  }

  /**
   * Decision 24: a 5-minute link to the image, only for its own clinic or the operator; undefined (404) for anyone else,
   * an unknown id, or a purged file.
   */
  async fileLink(id: string, scope: { clinicId: string } | "operator"): Promise<string | undefined> {
    if (id.length > 191) return undefined;
    const row = await this.prisma.paymentReceipt.findUnique({ where: { id }, select: { clinicId: true, purpose: true, fileKey: true, reference: true } });
    if (!row?.fileKey) return undefined;
    if (scope !== "operator" && (row.purpose !== "subscription" || row.clinicId !== scope.clinicId)) return undefined;
    return this.files.link(row.fileKey, { fileName: "payment-receipt" });
  }

  /** Decision 15: a purged sign-up's receipt images go with its other files; the rows stay. Returns the keys to delete. */
  async forgetFiles(tx: Tx, signupId: string): Promise<string[]> {
    const rows = await tx.paymentReceipt.findMany({ where: { purpose: "signup", signupId, fileKey: { not: null } }, select: { fileKey: true } });
    await tx.paymentReceipt.updateMany({ where: { purpose: "signup", signupId }, data: { fileKey: null } });
    return rows.map((r) => r.fileKey!);
  }
}
