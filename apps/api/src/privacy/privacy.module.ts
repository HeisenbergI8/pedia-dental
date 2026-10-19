import { Module } from "@nestjs/common";
import { RECORD_RETENTION } from "@pedia/shared";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";
import { SubscriptionRecordsModule } from "../subscription-records/subscription-records.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { ClinicDataService } from "./clinic-data";
import { ErasureService } from "./erasure.service";
import { PrivacyJobs, RETENTION_PERIODS } from "./privacy.jobs";

/**
 * B13c2b-2: anonymisation and the clinic data scripts' service (prisma/clinic-data.ts). A leaf: nothing imports it. No controller:
 * nothing here is a route, so MSW, API_ROUTES, RULES and the port ledger are untouched.
 */
@Module({
  imports: [OutboxModule, VisitDaysModule, AppointmentRecordsModule, StorageModule, SubscriptionRecordsModule],
  providers: [ErasureService, PrivacyJobs, ClinicDataService, { provide: RETENTION_PERIODS, useValue: RECORD_RETENTION }],
  exports: [ErasureService, ClinicDataService],
})
export class PrivacyModule {}
