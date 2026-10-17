import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { OutboxModule } from "../outbox/outbox.module";
import { PatientsModule } from "../patients/patients.module";
import { StorageModule } from "../storage/storage.module";
import { VisitsModule } from "../visits/visits.module";
import { PhotosController } from "./photos.controller";
import { PhotosService } from "./photos.service";

/** B10: clinical photos. A leaf: nothing imports it, so it can't close a cycle. */
@Module({ imports: [AuditModule, AuthModule, OutboxModule, PatientsModule, StorageModule, VisitsModule], controllers: [PhotosController], providers: [PhotosService] })
export class PhotosModule {}
