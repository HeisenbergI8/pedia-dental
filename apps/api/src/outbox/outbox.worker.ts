import { setTimeout as sleep } from "node:timers/promises";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { Clock } from "../common/clock";
import { type RequestContext, requestContext } from "../common/request-context";
import { ENV, type Env } from "../config/env";
import { Prisma } from "../generated/prisma/client.ts";
import { BACKGROUND } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { type OutboxEnvelope, OutboxHandlers } from "./outbox.handlers";

/** Data, so B9 can tune it. The lease outlasts a batch of slow provider calls. */
export const OUTBOX_POLICY = { batch: 10, leaseMs: 5 * 60_000, maxAttempts: 5, baseBackoffMs: 30_000, maxBackoffMs: 60 * 60_000 } as const;

/** The wait after failed attempt `attempt` (1-based): 30 s, 1 min, 2 min, … at most an hour. */
export const backoffMs = (attempt: number) => Math.min(OUTBOX_POLICY.baseBackoffMs * 2 ** (attempt - 1), OUTBOX_POLICY.maxBackoffMs);

/** What may be stored and logged about an error: its name and Prisma code. Never the message (personal data). */
export function describeError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `Prisma ${error.code}`;
  return (error instanceof Error ? error.name : typeof error).slice(0, 191);
}

class NoHandlerError extends Error {
  override name = "NoHandlerError";
}

/**
 * Sends what the outbox holds (CONVENTIONS → Side effects). Any number of instances may run it: SKIP LOCKED gives them
 * disjoint rows, and a lease (`availableAt` moved forward) hides a claimed row until its worker settles it or dies.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(OutboxWorker.name);
  private readonly stop = new AbortController();
  private loop?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly handlers: OutboxHandlers,
    @Inject(ENV) private readonly env: Env,
    @Inject(BACKGROUND) private readonly background: boolean,
  ) {}

  /** After every module's init, so every handler has registered. */
  onApplicationBootstrap() {
    if (this.background) this.loop = this.poll();
  }

  /** Lets the current batch finish, before PrismaService disconnects. */
  async onModuleDestroy() {
    this.stop.abort();
    await this.loop;
  }

  private async poll(): Promise<void> {
    const { signal } = this.stop;
    while (!signal.aborted) {
      let claimed = 0;
      try {
        claimed = await this.drain();
      } catch (error) {
        this.log.error(`Outbox poll failed (${describeError(error)})`);
      }
      if (claimed === 0) await sleep(this.env.OUTBOX_POLL_MS, undefined, { signal }).catch(() => undefined);
    }
  }

  /** Claims one batch of due rows and runs it. Returns how many it claimed: 0 means nothing is due. */
  async drain(): Promise<number> {
    const claimed = await this.claim();
    for (const message of claimed) await this.process(message);
    return claimed.length;
  }

  /**
   * Raw SQL for the lock (platform table, nothing to scope), then the rows through the model client, which types the
   * JSON payload. `attempts` read back is this claim's number.
   */
  private async claim(): Promise<OutboxEnvelope[]> {
    const now = this.clock.now();
    const ids = await runInTransaction(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM OutboxMessage WHERE status = 'pending' AND availableAt <= ${now}
        ORDER BY availableAt LIMIT ${Prisma.raw(String(OUTBOX_POLICY.batch))} FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) return [];
      const claimed = rows.map((r) => r.id);
      await tx.$executeRaw`
        UPDATE OutboxMessage SET attempts = attempts + 1, availableAt = ${new Date(now.getTime() + OUTBOX_POLICY.leaseMs)}
        WHERE id IN (${Prisma.join(claimed)})`;
      return claimed;
    });
    if (ids.length === 0) return [];
    const rows = await this.prisma.outboxMessage.findMany({
      where: { id: { in: ids } },
      select: { id: true, clinicId: true, kind: true, payload: true, attempts: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(({ attempts, ...row }) => ({ ...row, attempt: attempts }));
  }

  private async process(message: OutboxEnvelope): Promise<void> {
    const handler = this.handlers.get(message.kind);
    const ctx: RequestContext = { requestId: `outbox:${message.id}`, operator: false, ...(message.clinicId ? { clinicId: message.clinicId } : {}) };
    try {
      if (!handler) throw new NoHandlerError();
      // Awaited inside: the handler's Prisma queries are lazy (CONVENTIONS → Traps).
      await requestContext.run(ctx, async () => await handler.handle(message));
      await this.settle(message, { status: "done", processedAt: this.clock.now() });
    } catch (error) {
      const now = this.clock.now();
      const lastError = describeError(error);
      const giveUp = !handler || message.attempt >= OUTBOX_POLICY.maxAttempts;
      this.log.warn(`Outbox ${message.kind} ${message.id} attempt ${message.attempt} failed (${lastError})${giveUp ? "; giving up" : ""}`);
      await this.settle(
        message,
        giveUp ? { status: "failed", processedAt: now, lastError } : { availableAt: new Date(now.getTime() + backoffMs(message.attempt)), lastError },
      );
    }
  }

  /** Only while the claim is still this one: a worker whose lease ran out has been replaced by a newer claim. */
  private async settle({ id, attempt }: OutboxEnvelope, data: Prisma.OutboxMessageUpdateManyMutationInput): Promise<void> {
    const { count } = await this.prisma.outboxMessage.updateMany({ where: { id, attempts: attempt }, data });
    if (count === 0) this.log.warn(`Outbox ${id}: lease lost before attempt ${attempt} settled`);
  }
}
