import { Injectable, type OnModuleInit } from "@nestjs/common";

/** What a handler gets. `id` is the provider's idempotency key: a row is delivered at least once (B1-c decision 1). */
export type OutboxEnvelope = { id: string; clinicId: string | null; kind: string; payload: unknown; attempt: number };

/** Runs one kind of side effect, idempotently. Registers itself with `OutboxHandlers` in `onModuleInit`. */
export interface OutboxHandler {
  readonly kind: string;
  handle(message: OutboxEnvelope): Promise<void>;
}

/**
 * Kind → handler. Features register into it, so OutboxModule never imports them (no cycle with B9's MessagesModule).
 * Filled during module init, before the worker's loop starts (onApplicationBootstrap).
 */
@Injectable()
export class OutboxHandlers {
  private readonly byKind = new Map<string, OutboxHandler>();

  register(handler: OutboxHandler): void {
    if (this.byKind.has(handler.kind)) throw new Error(`Two outbox handlers for "${handler.kind}".`);
    this.byKind.set(handler.kind, handler);
  }

  get(kind: string): OutboxHandler | undefined {
    return this.byKind.get(kind);
  }
}

/** B1-c's only kind: proves the pipe end to end. B9 adds the message kinds. */
@Injectable()
export class NoopHandler implements OutboxHandler, OnModuleInit {
  readonly kind = "noop";
  constructor(private readonly registry: OutboxHandlers) {}
  onModuleInit() {
    this.registry.register(this);
  }
  async handle(_message: OutboxEnvelope): Promise<void> {}
}
