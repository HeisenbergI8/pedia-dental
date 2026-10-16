import { Injectable, type OnModuleInit } from "@nestjs/common";
import { z } from "zod";
import { type OutboxEnvelope, type OutboxHandler, OutboxHandlers } from "../outbox/outbox.handlers";
import { StorageService } from "./storage.service";

export const DELETE_FILE = "storage.delete";
const Payload = z.object({ key: z.string() });

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
  ) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async handle({ payload }: OutboxEnvelope): Promise<void> {
    await this.storage.delete(Payload.parse(payload).key);
  }
}
