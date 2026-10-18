import { Module } from "@nestjs/common";
import { ReceiptRecordsModule } from "../receipt-records/receipt-records.module";
import { SubscriptionRecordsModule } from "../subscription-records/subscription-records.module";
import { ClinicBillingController } from "./clinic-billing.controller";

/** B12: the Owner's subscription and receipts on Settings → Plan. */
@Module({ imports: [SubscriptionRecordsModule, ReceiptRecordsModule], controllers: [ClinicBillingController] })
export class ClinicBillingModule {}
