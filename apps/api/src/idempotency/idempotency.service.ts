import { createHash } from "node:crypto";
import { BadRequestException, Injectable, UnprocessableEntityException } from "@nestjs/common";
import { IDEMPOTENCY_KEY_MISSING, IDEMPOTENCY_KEY_REUSED, IdempotencyKey } from "@pedia/shared";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";

/** B8 E2: 24 hours. A retry after that records again; the web's retries are seconds apart. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
export type Answer<T> = { status: number; body: T; replayed: boolean };
/** What makes two requests "the same" for a key: the route, its record, who asks and what they send. */
export type KeyedRequest = { route: string; params: Record<string, string>; actor: string; body: unknown };

/** The header's key, or 400 in the shared words. Called first by the controller (E2's order). */
export function keyOf(header: string | string[] | undefined): string {
  const key = IdempotencyKey.safeParse(header);
  if (!key.success) throw new BadRequestException(IDEMPOTENCY_KEY_MISSING);
  return key.data;
}

/** Keys sorted at every level, so two equal requests always hash alike. */
const stable = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)]))
      : v;
export const fingerprintOf = (r: KeyedRequest) => createHash("sha256").update(JSON.stringify(stable(r))).digest("hex");

/** A raw INSERT's duplicate key: P2002 from a model query, P2010 wrapping MySQL's 1062 from raw SQL (int test case 10). */
export const isDuplicateKey = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError &&
  (e.code === "P2002" || (e.code === "P2010" && /1062|Duplicate entry/.test(`${JSON.stringify(e.meta ?? {})} ${e.message}`)));

/** A Date as MySQL DATETIME text in UTC, so raw SQL stores what Prisma's model writes store (the process runs in Manila). */
const utc = (d: Date) => d.toISOString().slice(0, 23).replace("T", " ");

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}

  /**
   * Runs `write` in one transaction that first claims the key (E2): the key exists exactly when the write committed.
   * A second request with the key waits on the claim, then replays the kept answer (422 for a different request). A
   * refusal rolls the claim back with it, so the key is free again.
   */
  async once<T>(key: string, request: KeyedRequest, write: (tx: Tx) => Promise<{ status: number; body: T }>, retried = false): Promise<Answer<T>> {
    const fingerprint = fingerprintOf(request);
    const clinicId = requireContext().clinicId!;
    try {
      return await runInTransaction(this.prisma, async (tx) => {
        const now = this.clock.now();
        // Raw on purpose: Prisma's create reads the row back, a plain read that would take the snapshot before
        // lockPatient (E1, CONVENTIONS: lock before the first plain read).
        await tx.$executeRaw`INSERT INTO IdempotencyKey (clinicId, \`key\`, fingerprint, status, createdAt, expiresAt)
          VALUES (${clinicId}, ${key}, ${fingerprint}, 0, ${utc(now)}, ${utc(new Date(now.getTime() + IDEMPOTENCY_TTL_MS))})`;
        const answer = await write(tx);
        await tx.idempotencyKey.updateMany({ where: { key }, data: { status: answer.status, response: answer.body as Prisma.InputJsonValue } });
        return { ...answer, replayed: false };
      });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const kept = await this.prisma.idempotencyKey.findFirst({ where: { key }, select: { fingerprint: true, status: true, response: true, expiresAt: true } });
      if (!kept || kept.expiresAt <= this.clock.now()) {
        if (retried) throw error;
        await this.prisma.idempotencyKey.deleteMany({ where: { key, expiresAt: { lte: this.clock.now() } } }); // expired: treat as new
        return this.once(key, request, write, true);
      }
      if (kept.fingerprint !== fingerprint) throw new UnprocessableEntityException(IDEMPOTENCY_KEY_REUSED);
      return { status: kept.status, body: kept.response as T, replayed: true };
    }
  }

  /** Expired keys of every clinic, 1,000 at a time (IdempotencyJobs). Raw: the extension refuses a cross-clinic delete. */
  async sweep(now = this.clock.now()): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.prisma.$executeRaw`DELETE FROM IdempotencyKey WHERE expiresAt < ${utc(now)} LIMIT 1000`;
      total += n;
      if (n < 1000) return total;
    }
  }
}
