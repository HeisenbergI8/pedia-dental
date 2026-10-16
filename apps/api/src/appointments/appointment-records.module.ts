import { Module } from "@nestjs/common";
import { AppointmentRecordsService } from "./appointment-records.service";

/** The Appointment table's single owner (B7, E4). Prisma only, so any feature can import it without a cycle. */
@Module({ providers: [AppointmentRecordsService], exports: [AppointmentRecordsService] })
export class AppointmentRecordsModule {}
