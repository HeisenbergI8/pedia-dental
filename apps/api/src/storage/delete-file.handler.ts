import { Injectable, type OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { type OutboxEnvelope, type OutboxHandler, OutboxHandlers } from "../outbox/outbox.handlers";
import { PlatformFilesService } from "./platform-files.service";
import { StorageService } from "./storage.service";

export const DELETE_FILE = "storage.delete";
/** B12: the outbox row that deletes one of Primolar's files once the change that unlinked it commits. */
export const deletePlatformFile = (key: string) => ({ kind: DELETE_FILE, payload: { key, platform: true }, clinicId: null });
const Payload = z.object({ key: z.string(), platform: z.boolean().optional() });

/**
 * Deletes a file nothing points at any more (a replaced or removed logo; B10's photos), after the change that unlinked
 * it commits (B3, Decision 9). Idempotent: deleting a missing file succeeds. The worker runs it inside the row's clinic,
 * so StorageService ignores another clinic's key.
 */
@Injectable()
export class DeleteFileHandler implements OutboxHandler, OnModuleInit {
  readonly kind = DELETE_FILE;

  constructor(
    private readonly registry: OutboxHandlers,
    private readonly storage: StorageService,
    private readonly platformFiles: PlatformFilesService,
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async handle({ payload }: OutboxEnvelope): Promise<void> {
    const { key, platform } = Payload.parse(payload);
    // B12: Primolar's files (`platform: true`) have no clinic and no ledger row.
    await (platform ? this.platformFiles.delete(key) : this.storage.delete(key));
  }
}
