import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PlatformSettingsModule } from "../platform-settings/platform-settings.module";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { StorageModule } from "../storage/storage.module";
import { TextTopUpsController } from "./text-topups.controller";
import { TextTopUpsService } from "./text-topups.service";

/** Feature 16 (revised): paid text top-ups. A leaf: subscriptions, the usage, the send claim and the console import it. */
@Module({
  imports: [AuditModule, PlatformSettingsModule, ReceiptRecordsModule, StorageModule],
  controllers: [TextTopUpsController],
  providers: [TextTopUpsService],
  exports: [TextTopUpsService],
})
export class TextTopUpsModule {}
