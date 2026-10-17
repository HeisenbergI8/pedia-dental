import { Module } from "@nestjs/common";
import { BillingRecordsService } from "./billing-records.service";

/** The money tables' one owner (E4). Prisma only, so any feature can import it without a cycle. */
@Module({ providers: [BillingRecordsService], exports: [BillingRecordsService] })
export class BillingRecordsModule {}
