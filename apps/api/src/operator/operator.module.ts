import { Module } from "@nestjs/common";
import { SignupsModule } from "../signups/signups.module";
import { SubscriptionRecordsModule } from "../subscription-records/subscription-records.module";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { UsageModule } from "../usage/usage.module";
import { AccountOverviewService } from "./account-overview";
import { OperatorSignupsController } from "./operator-signups.controller";
import { OperatorAccountsController } from "./operator-accounts.controller";
import { OperatorAccountsService } from "./operator-accounts.service";
import { OperatorReceiptsController } from "./operator-receipts.controller";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";

/** B12: Primolar's console. Outside every clinic: clinic data is read and written in that clinic's context, by id. */
@Module({
  imports: [SignupsModule, SubscriptionRecordsModule, ReceiptRecordsModule, UsageModule, OutboxModule, StorageModule],
  controllers: [OperatorAccountsController, OperatorSignupsController, OperatorReceiptsController],
  providers: [AccountOverviewService, OperatorAccountsService],
})
export class OperatorModule {}
