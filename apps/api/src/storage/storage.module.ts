import { Module } from "@nestjs/common";
import { ENV, type Env } from "../config/env";
import { LocalDiskStorage } from "./local-disk.storage";
import { FileStorage } from "./storage";
import { StorageService } from "./storage.service";

/** Imported by the features that keep files (B3's ClinicModule first). B10 picks the driver from the environment. */
@Module({
  providers: [{ provide: FileStorage, inject: [ENV], useFactory: (env: Env) => new LocalDiskStorage(env.STORAGE_DIR) }, StorageService],
  exports: [StorageService],
})
export class StorageModule {}
