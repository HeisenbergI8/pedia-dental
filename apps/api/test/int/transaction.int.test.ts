import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { isWriteConflict, runInTransaction, type Tx } from "../../src/prisma/transaction";
import { inClinic, resetDatabase, testPrisma } from "./support/database";

const prisma = testPrisma();
afterAll(() => prisma.onModuleDestroy());
beforeEach(() => resetDatabase(prisma));

/** Opens once `parties` callers have arrived; later calls (a retry) pass straight through. */
function barrier(parties: number) {
  let arrived = 0;
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return () => {
    if (++arrived >= parties) open();
    return opened;
  };
}

async function twoRows(): Promise<[string, string]> {
  const make = (actorId: string) =>
    inClinic("clinic_a", () =>
      prisma.auditEvent.create({ data: { clinicId: "clinic_a", at: new Date(), actorId, actorName: actorId, actorRole: "admin", action: "view", record: "Lock" } }),
    );
  return [(await make("one")).id, (await make("two")).id];
}

/** Locks `first`, waits until the other transaction holds its first lock, then asks for `second`. Raw SQL: a lock, not a model query. */
const lockInOrder = (tx: Tx, wait: () => Promise<void>, first: string, second: string) =>
  (async () => {
    await tx.$queryRaw`SELECT id FROM AuditEvent WHERE id = ${first} FOR UPDATE`;
    await wait();
    await tx.$queryRaw`SELECT id FROM AuditEvent WHERE id = ${second} FOR UPDATE`;
  })();

describe("deadlocks through the MariaDB adapter", () => {
  it("reach Prisma as a write conflict runInTransaction recognises (P2010 from a raw query, MySQL 1213)", async () => {
    const [a, b] = await twoRows();
    const wait = barrier(2);
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => lockInOrder(tx, wait, a, b), { timeout: 15_000 }),
      prisma.$transaction((tx) => lockInOrder(tx, wait, b, a), { timeout: 15_000 }),
    ]);
    const failures = results.flatMap((r) => (r.status === "rejected" ? [r.reason as unknown] : []));
    expect(failures).toHaveLength(1); // InnoDB picks one victim; the other commits
    expect(failures[0]).toMatchObject({ code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "1213" } } } });
    expect(isWriteConflict(failures[0])).toBe(true);
  });

  it("are retried by runInTransaction, so both callers finish", async () => {
    const [a, b] = await twoRows();
    const wait = barrier(2);
    let attempts = 0;
    const run = (first: string, second: string) =>
      runInTransaction(prisma, (tx) => {
        attempts++;
        return lockInOrder(tx, wait, first, second);
      }, { timeout: 15_000 });
    await expect(Promise.all([run(a, b), run(b, a)])).resolves.toBeDefined();
    expect(attempts).toBe(3); // two first tries, one rerun of the victim
  });
});
