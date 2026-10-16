import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { LegalModule } from "../legal/legal.module";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";
import { BranchesService } from "./branches.service";
import { ClinicController } from "./clinic.controller";
import { ClinicService } from "./clinic.service";
import { StaffService } from "./staff.service";

/** The clinic account and its setup. Credentials stay AuthModule's (IdentityService); files StorageModule's. */
@Module({
  imports: [AuthModule, AuditModule, StorageModule, OutboxModule, LegalModule, AppointmentRecordsModule],
  controllers: [ClinicController],
  providers: [ClinicService, BranchesService, StaffService],
  exports: [ClinicService],
})
export class ClinicModule {}
