import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { PrivacyRequestsController } from "./privacy-requests.controller";
import { PrivacyRequestsService } from "./privacy-requests.service";

/** B13c2b: a leaf (nothing imports it), so importing PatientsModule (and, Step 3.4, AppointmentsModule) closes no cycle. */
@Module({ imports: [AuditModule, PatientsModule], controllers: [PrivacyRequestsController], providers: [PrivacyRequestsService] })
export class PrivacyRequestsModule {}
