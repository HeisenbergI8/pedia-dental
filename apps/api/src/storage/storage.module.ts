import { Module } from "@nestjs/common";
import { Clock } from "../common/clock";
import { ENV, type Env } from "../config/env";
import { OutboxModule } from "../outbox/outbox.module";
import { DeleteFileHandler } from "./delete-file.handler";
import { fileStorageOf } from "./file-storage";
import { LocalFilesController } from "./local-files.controller";
import { FileStorage } from "./storage";
import { StorageService } from "./storage.service";

/**
 * Imported by the features that keep files (B3's ClinicModule, B4's PatientsModule, B10's PhotosModule). The driver comes
 * from the environment (fileStorageOf). Serves the local driver's links (LocalFilesController, E2).
 * Registers `storage.delete`, the outbox kind that removes a file once nothing points at it.
 */
@Module({
  imports: [OutboxModule],
  controllers: [LocalFilesController],
  providers: [
    { provide: FileStorage, inject: [ENV, Clock], useFactory: (env: Env, clock: Clock) => fileStorageOf(env, () => clock.now().getTime()) },
    StorageService,
    DeleteFileHandler,
  ],
  exports: [StorageService],
})
export class StorageModule {}
