import { Prisma } from "../generated/prisma/client.ts";
import type { PrismaService } from "./prisma.service";

/** The client inside a transaction. Pass it to every write that must commit or roll back together. */
export type Tx = Prisma.TransactionClient;

type Options = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
  /** Total tries when MySQL reports a deadlock or write conflict (P2034). Default 3. */
  attempts?: number;
};

/**
 * Runs `fn` in one interactive transaction (CONVENTIONS → Data): every write touching more than one row, and any
 * rule checked before a write (double-booking, tier limits, balances), goes through here. Services call it;
 * controllers never do. A deadlock or write conflict reruns the whole of `fn`, so `fn` must have no effect outside
 * the database: anything leaving the system goes to the outbox (B1-c), inside `fn`.
 */
export async function runInTransaction<T>(
  prisma: Pick<PrismaService, "$transaction">,
  fn: (tx: Tx) => Promise<T>,
  { attempts = 3, ...options }: Options = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, options);
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) throw error;
    }
  }
}

const isWriteConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
