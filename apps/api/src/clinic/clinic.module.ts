import { Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module";
import { StorageModule } from "../storage/storage.module";
import { ClinicController } from "./clinic.controller";
import { ClinicService } from "./clinic.service";

@Module({ imports: [StorageModule, OutboxModule], controllers: [ClinicController], providers: [ClinicService], exports: [ClinicService] })
export class ClinicModule {}
