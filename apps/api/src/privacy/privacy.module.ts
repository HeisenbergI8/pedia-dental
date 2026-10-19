import { Module } from "@nestjs/common";
import { RECORD_RETENTION } from "@pedia/shared";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { OutboxModule } from "../outbox/outbox.module";
import { VisitDaysModule } from "../visits/visit-days.module";
import { ErasureService } from "./erasure.service";
import { PrivacyJobs, RETENTION_PERIODS } from "./privacy.jobs";

/**
 * B13c2b-2: anonymisation (and, Step 4.1, the clinic data scripts' service). A leaf: nothing imports it. No controller:
 * nothing here is a route, so MSW, API_ROUTES, RULES and the port ledger are untouched.
 */
@Module({
  imports: [OutboxModule, VisitDaysModule, AppointmentRecordsModule],
  providers: [ErasureService, PrivacyJobs, { provide: RETENTION_PERIODS, useValue: RECORD_RETENTION }],
  exports: [ErasureService],
})
export class PrivacyModule {}
