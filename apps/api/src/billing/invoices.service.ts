import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { CreateInvoiceInput, VoidInvoiceInput, liveInvoices, rolesCan, unbilledItems, type Invoice } from "@pedia/shared";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { AuditService } from "../audit/audit.service";
import { RecordOwners } from "../auth/record-owners";
import type { ClinicIdentity } from "../auth/identity.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IdempotencyService, type Answer } from "../idempotency/idempotency.service";
import { PATIENT_NOT_FOUND, lockPatient } from "../patients/patient-lock";
import { PatientsService } from "../patients/patients.service";
import { PlanService } from "../plan/plan.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { INVOICE_NOT_FOUND, duplicateRefusal, invoiceAppointment, invoiceRefusal, voidRefusal } from "./billing.rules";

/** features/billing/mocks.ts: a patient's bills, billing done treatments, and voiding one made by mistake (decision 2). */
@Injectable()
export class InvoicesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: BillingRecordsService,
    private readonly keys: IdempotencyService,
    private readonly patients: PatientsService,
    private readonly plan: PlanService,
    private readonly visits: VisitsService,
    private readonly appointments: AppointmentRecordsService,
    private readonly clinic: ClinicService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly owners: RecordOwners,
  ) {}

  /** B13c2b: the guard finds a restricted child behind a bill (BillingRecordsService owns Invoice). */
  onModuleInit() {
    for (const path of ["/invoices/:id/payments", "/invoices/:id/apply-credit", "/invoices/:id/void"]) this.owners.register(path, (id) => this.records.patientOfInvoice(id));
  }

  /**
   * GET /patients/:id/invoices: oldest first. Staff see voided ones too; a parent (billing.view only for their own
   * children) doesn't (B8 question 3). Audited per child, as the mock.
   */
  async list(patientId: string, who: ClinicIdentity): Promise<Invoice[]> {
    const rows = await this.records.invoicesOf(patientId);
    await this.audit.record("view", "Invoices", patientId);
    return rolesCan(who.user.roles, "billing.view", "all") ? rows : liveInvoices(rows);
  }

  /** POST /patients/:id/invoices: key (controller) → 404 → 400 → 400 twice → replay → 409 → 400 discount → 201. */
  async create(patientId: string, key: string, body: unknown, who: ClinicIdentity): Promise<Answer<Invoice>> {
    if (!(await this.patients.exists(patientId))) throw new NotFoundException(PATIENT_NOT_FOUND);
    const input = new ZodValidationPipe(CreateInvoiceInput).transform(body);
    refuse(duplicateRefusal(input.planItemIds));
    return this.keys.once(key, { route: "POST /patients/:id/invoices", params: { id: patientId }, actor: who.user.id, body: input }, async (tx) => {
      await lockPatient(tx, patientId);
      const [items, invoices] = await Promise.all([this.plan.items(tx, patientId), this.records.invoicesOf(patientId, tx)]);
      // In the order asked, as the mock's lines.
      const billable = new Map(unbilledItems(items, invoices).map((i) => [i.id, i]));
      const chosen = input.planItemIds.flatMap((id) => billable.get(id) ?? []);
      // Names and fees are copied at billing, so a later catalog change doesn't rewrite an issued bill.
      const names = new Map((await this.clinic.procedures()).map((p) => [p.code, p.name]));
      const lines = chosen.map((i) => ({ planItemId: i.id, procedureCode: i.procedureCode, description: names.get(i.procedureCode) ?? i.procedureCode, tooth: i.tooth, amount: i.fee }));
      refuse(invoiceRefusal(input.planItemIds, [...billable.keys()], lines.reduce((s, l) => s + l.amount, 0), input.discount));
      const visitIds = chosen.map((i) => i.completedVisitId);
      const appointmentId = invoiceAppointment(visitIds, await this.visits.appointmentsOf(tx, visitIds.flatMap((v) => v ?? [])));
      // The branch of the visit it bills; billed without an appointment, the branch this device is on.
      const branchId = (appointmentId && (await this.appointments.one(tx, appointmentId))?.branchId) || requireContext().branchId!;
      const invoice = await this.records.createInvoice(tx, { branchId, patientId, appointmentId, lines, discount: input.discount, issuedAt: this.clock.now().toISOString() });
      await this.audit.record("create", "Invoice", patientId, tx);
      return { status: 201, body: invoice };
    });
  }

  /** POST /invoices/:id/void: 404 → 400 → 409 voided → 409 paid → 200. No key: a repeat is a 409 (E9). */
  async void(invoiceId: string, body: unknown, who: ClinicIdentity): Promise<Invoice> {
    const patientId = await this.records.patientOfInvoice(invoiceId); // outside the transaction (B6 decision 3)
    if (!patientId) throw new NotFoundException(INVOICE_NOT_FOUND);
    const { reason } = new ZodValidationPipe(VoidInvoiceInput).transform(body);
    return runInTransaction(this.prisma, async (tx) => {
      await lockPatient(tx, patientId);
      const invoice = (await this.records.lockInvoice(tx, invoiceId))!;
      refuse(voidRefusal(invoice, (await this.records.paidOn(tx, invoiceId)).rows));
      const voided = await this.records.voidInvoice(tx, invoiceId, { at: this.clock.now(), by: who.staffId!, reason });
      await this.audit.record("update", "Invoice (voided)", patientId, tx);
      return voided;
    });
  }
}
