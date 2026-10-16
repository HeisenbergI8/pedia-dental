import { Module } from "@nestjs/common";
import { VisitDaysService } from "./visit-days.service";

/** The one visits query patient reads need. Its own module, as FamilyModule, so PatientsModule needn't import VisitsModule. */
@Module({ providers: [VisitDaysService], exports: [VisitDaysService] })
export class VisitDaysModule {}
