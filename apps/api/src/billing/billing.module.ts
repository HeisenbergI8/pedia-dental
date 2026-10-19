import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AuditModule } from "../audit/audit.module";
import { BillingRecordsModule } from "../billing-records/billing-records.module";
import { ClinicModule } from "../clinic/clinic.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";
import { PatientsModule } from "../patients/patients.module";
import { PlanModule } from "../plan/plan.module";
import { VisitsModule } from "../visits/visits.module";
import { BillingController } from "./billing.controller";
import { InvoicesService } from "./invoices.service";
import { PaymentsService } from "./payments.service";

/** Billing (B8): bills, payments, deposits and credit. The tables are BillingRecordsService's (E4). */
@Module({
  imports: [BillingRecordsModule, IdempotencyModule, PatientsModule, PlanModule, VisitsModule, AppointmentRecordsModule, ClinicModule, AuditModule],
  controllers: [BillingController],
  providers: [InvoicesService, PaymentsService],
  exports: [InvoicesService, PaymentsService], // B13c2a: the copy of records reads a child's bills and payments
})
export class BillingModule {}
