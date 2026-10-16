import { Module } from "@nestjs/common";
import { ENV, type Env } from "../config/env";
import { OutboxModule } from "../outbox/outbox.module";
import { DeleteFileHandler } from "./delete-file.handler";
import { LocalDiskStorage } from "./local-disk.storage";
import { FileStorage } from "./storage";
import { StorageService } from "./storage.service";

/**
 * Imported by the features that keep files (B3's ClinicModule first). B10 picks the driver from the environment.
 * Registers `storage.delete`, the outbox kind that removes a file once nothing points at it.
 */
@Module({
  imports: [OutboxModule],
  providers: [{ provide: FileStorage, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.STORAGE_DIR) }, StorageService, DeleteFileHandler],
  exports: [StorageService],
})
export class StorageModule {}
