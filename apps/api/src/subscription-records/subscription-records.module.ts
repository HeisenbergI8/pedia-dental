import { Module } from "@nestjs/common";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionRecordsService } from "./subscription-records.service";

/** B12: Primolar's subscriptions. A leaf over the two others, so sign-in, the clinic's limits and the console can import it. */
@Module({
  imports: [PlatformSettingsModule, ReceiptRecordsModule, StorageModule],
  providers: [SubscriptionRecordsService],
  exports: [SubscriptionRecordsService],
})
export class SubscriptionRecordsModule {}
