import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionRecordsModule } from "../subscription-records/subscription-records.module";
import { ClinicFactory } from "./clinic-factory";
import { SignupsController } from "./signups.controller";
import { SignupsJobs } from "./signups.jobs";
import { SignupsService } from "./signups.service";

/** B12: sign-ups (public and the console's) and the clinics made from them. */
@Module({
  imports: [AuthModule, AuditModule, OutboxModule, PlatformSettingsModule, ReceiptRecordsModule, StorageModule, SubscriptionRecordsModule],
  controllers: [SignupsController],
  providers: [SignupsService, ClinicFactory, SignupsJobs],
  exports: [SignupsService],
})
export class SignupsModule {}
