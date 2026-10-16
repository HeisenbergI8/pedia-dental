import { Module } from "@nestjs/common";
import { AppointmentRecordsModule } from "../appointments/appointment-records.module";
import { VisitDaysService } from "./visit-days.service";

/** The days patients were seen, for patient reads. Its own module, as FamilyModule, so PatientsModule needn't import VisitsModule. */
@Module({ imports: [AppointmentRecordsModule], providers: [VisitDaysService], exports: [VisitDaysService] })
export class VisitDaysModule {}
