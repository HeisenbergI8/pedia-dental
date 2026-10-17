import { setTimeout as sleep } from "node:timers/promises";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { Clock } from "../common/clock";
import { type RequestContext, requestContext } from "../common/request-context";
import { ENV, type Env } from "../config/env";
import { Prisma } from "../generated/prisma/client.ts";
import { BACKGROUND } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { OutboxDefer, type OutboxEnvelope, type OutboxHandler, OutboxHandlers, OutboxPermanent } from "./outbox.handlers";

/** Data, so B9 can tune it. The lease outlasts a batch of slow provider calls. */
export const OUTBOX_POLICY = { batch: 10, leaseMs: 5 * 60_000, maxAttempts: 5, baseBackoffMs: 30_000, maxBackoffMs: 60 * 60_000 } as const;

/** The wait after failed attempt `attempt` (1-based): 30 s, 1 min, 2 min, … at most an hour. */
export const backoffMs = (attempt: number) => Math.min(OUTBOX_POLICY.baseBackoffMs * 2 ** (attempt - 1), OUTBOX_POLICY.maxBackoffMs);

/** The wait after failed attempt `attempt`: the kind's own schedule (retryDelaysMs) or the default. `undefined`: give up. */
export function nextDelayMs(handler: Pick<OutboxHandler, "retryDelaysMs"> | undefined, attempt: number): number | undefined {
  const delays = handler?.retryDelaysMs;
  if (delays) return delays[attempt - 1];
  return attempt >= OUTBOX_POLICY.maxAttempts ? undefined : backoffMs(attempt);
}

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
      if (error instanceof OutboxDefer) {
        // Not a failure: hand the try back, so sending hours never spend a retry (B9 E4).
        await this.settle(message, { availableAt: error.until, attempts: { decrement: 1 } });
        return;
      }
      const now = this.clock.now();
      const lastError = describeError(error);
      const delay = error instanceof OutboxPermanent ? undefined : nextDelayMs(handler, message.attempt);
      const giveUp = !handler || delay === undefined;
      this.log.warn(`Outbox ${message.kind} ${message.id} attempt ${message.attempt} failed (${lastError})${giveUp ? "; giving up" : ""}`);
      const settled = await this.settle(
        message,
        giveUp ? { status: "failed", processedAt: now, lastError } : { availableAt: new Date(now.getTime() + delay), lastError },
      );
      // Only the claim that settled the row tells the feature (a lost lease means a newer claim owns it).
      if (giveUp && settled && handler?.deadLetter) {
        const reason = error instanceof OutboxPermanent ? error.reason : undefined;
        await requestContext
          .run(ctx, async () => await handler.deadLetter!(message, reason))
          .catch((e: unknown) => this.log.error(`Outbox ${message.kind} ${message.id}: dead-letter hook failed (${describeError(e)})`));
      }
    }
  }

  /** Only while the claim is still this one: a worker whose lease ran out has been replaced by a newer claim. */
  private async settle({ id, attempt }: OutboxEnvelope, data: Prisma.OutboxMessageUpdateManyMutationInput): Promise<boolean> {
    const { count } = await this.prisma.outboxMessage.updateMany({ where: { id, attempts: attempt }, data });
    if (count === 0) this.log.warn(`Outbox ${id}: lease lost before attempt ${attempt} settled`);
    return count === 1;
  }
}
