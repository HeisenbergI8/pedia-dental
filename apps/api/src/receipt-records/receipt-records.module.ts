import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { ReceiptRecordsService } from "./receipt-records.service";

/** B12: the receipts sent after paying by QR. A leaf, so sign-ups and subscriptions can both import it. */
@Module({
  imports: [StorageModule],
  providers: [ReceiptRecordsService],
  exports: [ReceiptRecordsService],
})
export class ReceiptRecordsModule {}
