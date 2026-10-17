import { randomBytes } from "node:crypto";
import { Module } from "@nestjs/common";
import { Clock } from "../common/clock";
import { ENV, type Env } from "../config/env";
import { OutboxModule } from "../outbox/outbox.module";
import { DeleteFileHandler } from "./delete-file.handler";
import { LocalDiskStorage } from "./local-disk.storage";
import { LocalFilesController } from "./local-files.controller";
import { FileStorage } from "./storage";
import { StorageService } from "./storage.service";

/**
 * Imported by the features that keep files (B3's ClinicModule first). B10 picks the driver from the environment.
 * Registers `storage.delete`, the outbox kind that removes a file once nothing points at it.
 */
@Module({
  imports: [OutboxModule],
  controllers: [LocalFilesController],
  providers: [
    { provide: FileStorage, inject: [ENV, Clock], useFactory: (env: Env, clock: Clock) => new LocalDiskStorage(env.STORAGE_DIR, randomBytes(32).toString("hex"), () => clock.now().getTime()) },
    StorageService,
    DeleteFileHandler,
  ],
  exports: [StorageService],
})
export class StorageModule {}
