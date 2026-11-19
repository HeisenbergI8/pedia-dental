import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { StorageModule } from "../storage/storage.module";
import { TextTopUpsModule } from "../text-topups/text-topups.module";
import { SubscriptionRecordsService } from "./subscription-records.service";
import { SubscriptionsJobs } from "./subscriptions.jobs";

/** B12: Primolar's subscriptions. A leaf over the two others, so sign-in, the clinic's limits and the console can import it. */
@Module({
  imports: [AuditModule, PlatformSettingsModule, ReceiptRecordsModule, StorageModule, TextTopUpsModule],
  providers: [SubscriptionRecordsService, SubscriptionsJobs],
  exports: [SubscriptionRecordsService],
})
export class SubscriptionRecordsModule {}
