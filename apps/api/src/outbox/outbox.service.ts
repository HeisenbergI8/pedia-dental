import { Injectable } from "@nestjs/common";
import { Clock } from "../common/clock";
import { currentContext } from "../common/request-context";
import type { Prisma } from "../generated/prisma/client.ts";
import type { Tx } from "../prisma/transaction";
import { OutboxHandlers } from "./outbox.handlers";

export type OutboxInput = {
  kind: string;
  /** Ids and flags only, never patient data: the handler loads what it sends. */
  payload: Prisma.InputJsonObject;
  /** Not before this moment (B9's reminders). Default now. */
  availableAt?: Date;
  /** Default: the request's clinic. Null for platform mail (B12). */
  clinicId?: string | null;
};

/** The outbox's write side. Every feature that causes a side effect calls `enqueue` inside its own transaction. */
@Injectable()
export class OutboxService {
  constructor(
    private readonly clock: Clock,
    private readonly handlers: OutboxHandlers,
  ) {}

  /**
   * Queues a side effect in the caller's transaction (CONVENTIONS → Side effects): it exists only if the change that
   * caused it commits, and a rerun of the transaction (runInTransaction on a deadlock) rolls the first try's row back.
   * Pass the `tx` from runInTransaction, never the root client. A kind without a handler is refused here, at write time.
   */
  async enqueue(tx: Tx, { kind, payload, availableAt, clinicId = currentContext()?.clinicId ?? null }: OutboxInput): Promise<void> {
    if (!this.handlers.get(kind)) throw new Error(`No outbox handler for "${kind}".`);
    const now = this.clock.now();
    // createMany: one INSERT, no read-back (B14: the booking's queued texts run inside the clinic's lock).
    await tx.outboxMessage.createMany({ data: [{ kind, payload, clinicId, availableAt: availableAt ?? now, createdAt: now }] });
  }
}
