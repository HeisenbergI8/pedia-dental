import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ApplyCreditInput, RecordPaymentInput, depositBalance, depositLegs, depositPool, type Payment } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import type { ClinicIdentity } from "../auth/identity.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IdempotencyService, type Answer, type KeyedRequest } from "../idempotency/idempotency.service";
import { PATIENT_NOT_FOUND, lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { INVOICE_NOT_FOUND, NOT_STAFF_NOW, creditRefusal, depositRefusal, paymentRefusal, refundRefusal } from "./billing.rules";

/**
 * features/billing/mocks.ts: money in and out. Every write runs in IdempotencyService.once's transaction, locking
 * key → patient → bill → the receipt counter, in that order (E1).
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly records: BillingRecordsService,
    private readonly keys: IdempotencyService,
    private readonly patients: PatientsService,
    private readonly clinic: ClinicService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** GET /patients/:id/payments: received order. Audited per child, as the mock. */
  async history(patientId: string): Promise<Payment[]> {
    const rows = await this.records.paymentsOf(patientId);
    await this.audit.record("view", "Payments", patientId);
    return rows;
  }

  /** POST /invoices/:id/payments: key → 404 → 400 → 403 refund → 400 staff → replay → 409s → 201. */
  async pay(invoiceId: string, key: string, body: unknown, who: ClinicIdentity): Promise<Answer<Payment>> {
    const patientId = await this.invoicePatient(invoiceId);
    const input = new ZodValidationPipe(RecordPaymentInput).transform(body);
    refuse(refundRefusal(input.amount, who.user.roles));
    await this.worksHere(input.receivedBy);
    return this.keys.once(key, request("POST /invoices/:id/payments", invoiceId, who, input), async (tx) => {
      await lockPatient(tx, patientId);
      const invoice = (await this.records.lockInvoice(tx, invoiceId))!;
      refuse(paymentRefusal(invoice, await this.records.paidOn(tx, invoiceId), input.amount));
      const receiptNo = await this.records.nextReceipt(tx, "AR");
      // The money is the bill's branch's, wherever it is paid.
      const [payment] = await this.records.addPayments(tx, [
        { ...input, branchId: invoice.branchId, patientId, invoiceId, receiptNo, receiptLeg: 0, receivedAt: this.clock.now().toISOString() },
      ]);
      await this.audit.record("create", "Payment", patientId, tx);
      return { status: 201, body: payment! };
    });
  }

  /** POST /patients/:id/deposits: money before billing (+), or a deposit refund (−). Handed over at this device's branch. */
  async deposit(patientId: string, key: string, body: unknown, who: ClinicIdentity): Promise<Answer<Payment>> {
    if (!(await this.patients.exists(patientId))) throw new NotFoundException(PATIENT_NOT_FOUND);
    const input = new ZodValidationPipe(RecordPaymentInput).transform(body);
    refuse(refundRefusal(input.amount, who.user.roles));
    await this.worksHere(input.receivedBy);
    return this.keys.once(key, request("POST /patients/:id/deposits", patientId, who, input), async (tx) => {
      await lockPatient(tx, patientId);
      refuse(depositRefusal(depositBalance(await this.records.depositRows(tx, patientId), patientId), input.amount));
      const receiptNo = await this.records.nextReceipt(tx, "AR");
      const [payment] = await this.records.addPayments(tx, [
        { ...input, branchId: requireContext().branchId!, patientId, receiptNo, receiptLeg: 0, receivedAt: this.clock.now().toISOString() },
      ]);
      await this.audit.record("create", "Deposit", patientId, tx);
      return { status: 201, body: payment! };
    });
  }

  /** POST /invoices/:id/apply-credit: deposit onto the bill (+) or back (−), one CR number for every leg. Returns the bill side. */
  async applyCredit(invoiceId: string, key: string, body: unknown, who: ClinicIdentity): Promise<Answer<Payment>> {
    const patientId = await this.invoicePatient(invoiceId);
    const { amount, receivedBy } = new ZodValidationPipe(ApplyCreditInput).transform(body);
    await this.worksHere(receivedBy);
    return this.keys.once(key, request("POST /invoices/:id/apply-credit", invoiceId, who, { amount, receivedBy }), async (tx) => {
      await lockPatient(tx, patientId);
      const invoice = (await this.records.lockInvoice(tx, invoiceId))!;
      const [paid, deposits] = await Promise.all([this.records.paidOn(tx, invoiceId), this.records.depositRows(tx, patientId)]);
      refuse(creditRefusal(invoice, paid, depositBalance(deposits, patientId), amount));
      const receiptNo = await this.records.nextReceipt(tx, "CR");
      const base = { patientId, method: "account_credit" as const, receivedBy, receiptNo, receivedAt: this.clock.now().toISOString() };
      // The bill side is the bill's branch's money; the deposit side comes off the branches that hold it.
      const legs = depositLegs(invoice.branchId, depositPool(deposits, patientId, invoiceId, amount), amount);
      const [onInvoice] = await this.records.addPayments(tx, [
        { ...base, branchId: invoice.branchId, invoiceId, amount, note: amount > 0 ? "Paid from deposit" : "Returned to deposit", receiptLeg: 0 },
        ...legs.map(([branchId, share], i) => ({ ...base, branchId, appliedTo: invoiceId, amount: share, receiptLeg: i + 1 })),
      ]);
      await this.audit.record("create", "Deposit applied", patientId, tx);
      return { status: 201, body: onInvoice! };
    });
  }

  private async invoicePatient(id: string): Promise<string> {
    const patientId = await this.records.patientOfInvoice(id); // outside the transaction (B6 decision 3)
    if (!patientId) throw new NotFoundException(INVOICE_NOT_FOUND);
    return patientId;
  }

  private async worksHere(staffId: string) {
    if (!(await this.clinic.isActiveStaff(staffId))) throw new BadRequestException(NOT_STAFF_NOW);
  }
}

const request = (route: string, id: string, who: ClinicIdentity, body: unknown): KeyedRequest => ({ route, params: { id }, actor: who.user.id, body });
