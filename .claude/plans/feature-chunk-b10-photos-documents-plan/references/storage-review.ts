// apps/api/src/storage/{storage.ts,storage.service.ts,local-disk.storage.ts,storage.module.ts} (B1-c), as of 2026-10-17.
// The storage interface B10 extends: clinic-scoped keys, a local-disk driver, deletion through the outbox.

// storage.ts
export const STORAGE_AREAS = ["branding", "patients"] as const; // NOTE B10 adds "photos"
export const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" } as const;
// clinicKey(clinicId, area, name, ext) builds clinics/<clinicId>/<area>/<name>.<ext>; parseKey rejects any other shape.
export abstract class FileStorage {
  abstract put(key: string, body: Buffer): Promise<void>; // IMPORTANT Buffer only: B10 adds Readable + PutInfo (S3 needs a length)
  abstract get(key: string): Promise<Buffer | undefined>;
  abstract delete(key: string): Promise<void>;
  // NOTE no link(): B10 adds it (E2)
}

// storage.service.ts
// put(area, ext, body: Buffer) builds the key from requireContext().clinicId; get/delete check own(key):
//   parseKey(key)?.clinicId === this.clinicId(), so another clinic's key reads as missing (decision 3's base layer).
// IMPORTANT constructor(files: FileStorage) only: B10 adds PrismaService + Clock for the StoredFile ledger (E5),
// so every unit test that builds StorageModule must provide both (storage.test.ts already overrides OutboxModule).

// local-disk.storage.ts
// put: writeFile(partial) then rename (atomic for readers). pathOf() refuses anything resolving outside root.
// NOTE "Not shared between instances": S3FileStorage covers multi-instance (CONVENTIONS trap reworded in Step 9.3).

// storage.module.ts
// providers: FileStorage via useFactory (env) => new LocalDiskStorage(env.STORAGE_DIR), StorageService, DeleteFileHandler.
// B10 swaps the factory for fileStorageOf(env) (Step 4.3).

// delete-file.handler.ts: outbox kind "storage.delete", payload { key }, idempotent; runs inside the row's clinic.
