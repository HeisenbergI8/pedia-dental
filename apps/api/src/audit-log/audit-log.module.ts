import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { AuditLogController } from "./audit-log.controller";

/** B13c2a: a leaf (nothing imports it), so the reader's PatientsModule import closes no cycle with AuditModule. */
@Module({ imports: [AuditModule, PatientsModule], controllers: [AuditLogController] })
export class AuditLogModule {}
