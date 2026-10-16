import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FixedClock } from "../../src/common/clock";
import { requestContext } from "../../src/common/request-context";
import { NoopHandler, type OutboxEnvelope } from "../../src/outbox/outbox.handlers";
import { OutboxService } from "../../src/outbox/outbox.service";
import { backoffMs, OUTBOX_POLICY, OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { runInTransaction } from "../../src/prisma/transaction";
import { inClinic, resetDatabase, testPrisma } from "./support/database";
import { createIntApp } from "./support/int-app";

const NOW = new Date("2026-10-16T02:00:00.000Z");
const prisma = testPrisma();
const clock = new FixedClock(NOW);
// Two API instances, two workers, one database.
let a: INestApplication;
let b: INestApplication;

beforeAll(async () => {
  [a, b] = await Promise.all([createIntApp({ clock }), createIntApp({ clock })]);
});
afterAll(async () => {
  await Promise.all([a.close(), b.close()]);
  await prisma.onModuleDestroy();
});
beforeEach(async () => {
  clock.set(NOW);
  vi.restoreAllMocks();
  await resetDatabase(prisma);
});

/** As a feature would: through app `a`'s service, in one transaction, inside a clinic. */
const enqueue = (count: number, clinicId = "clinic_a") =>
  inClinic(clinicId, () =>
    runInTransaction(a.get(PrismaService), async (tx) => {
      for (let n = 0; n < count; n++) await a.get(OutboxService).enqueue(tx, { kind: "noop", payload: { n } });
    }),
  );

const drainAll = async (worker: OutboxWorker) => {
  while ((await worker.drain()) > 0);
};

describe("the outbox", () => {
  it("holds a row only when the caller's transaction commits", async () => {
    const failing = inClinic("clinic_a", () =>
      runInTransaction(a.get(PrismaService), async (tx) => {
        await a.get(OutboxService).enqueue(tx, { kind: "noop", payload: {} });
        throw new Error("the change failed");
      }),
    );
    await expect(failing).rejects.toThrow("the change failed");
    expect(await prisma.outboxMessage.count()).toBe(0);

    await enqueue(1);
    expect(await prisma.outboxMessage.findFirst()).toMatchObject({ clinicId: "clinic_a", kind: "noop", status: "pending", attempts: 0, availableAt: NOW });
  });

  it("refuses a kind no handler runs", async () => {
    const typo = inClinic("clinic_a", () => runInTransaction(a.get(PrismaService), (tx) => a.get(OutboxService).enqueue(tx, { kind: "sms.typo", payload: {} })));
    await expect(typo).rejects.toThrow(/No outbox handler/);
  });

  it("never gives one row to two workers", async () => {
    await enqueue(120);
    const seen = { a: [] as string[], b: [] as string[] };
    for (const [name, app] of [["a", a], ["b", b]] as const) {
      vi.spyOn(app.get(NoopHandler), "handle").mockImplementation(async (m: OutboxEnvelope) => {
        seen[name].push(m.id);
        await new Promise((resolve) => setTimeout(resolve, 2)); // hold the batch, so the two workers' claims overlap
      });
    }
    await Promise.all([drainAll(a.get(OutboxWorker)), drainAll(b.get(OutboxWorker))]);

    const all = [...seen.a, ...seen.b];
    expect(all).toHaveLength(120);
    expect(new Set(all).size).toBe(120);
    expect(seen.a.length).toBeGreaterThan(0);
    expect(seen.b.length).toBeGreaterThan(0);
    expect(await prisma.outboxMessage.count({ where: { status: "done", attempts: 1 } })).toBe(120); // each claimed once
  });

  it("retries a failing row after its backoff, then marks it failed without the error's text", async () => {
    await enqueue(1);
    vi.spyOn(a.get(NoopHandler), "handle").mockRejectedValue(new Error("+63 917 555 0101"));
    const worker = a.get(OutboxWorker);
    for (let attempt = 1; attempt <= OUTBOX_POLICY.maxAttempts; attempt++) {
      expect(await worker.drain()).toBe(1);
      expect(await worker.drain()).toBe(0); // not due again until the backoff passes
      clock.set(new Date(clock.now().getTime() + backoffMs(attempt)));
    }
    expect(await prisma.outboxMessage.findFirstOrThrow()).toMatchObject({ status: "failed", attempts: OUTBOX_POLICY.maxAttempts, lastError: "Error" });
    expect(await worker.drain()).toBe(0);
  });

  it("runs each handler inside its row's clinic", async () => {
    await enqueue(1, "clinic_b");
    let clinic: string | undefined;
    vi.spyOn(a.get(NoopHandler), "handle").mockImplementation(async () => {
      clinic = requestContext.current()?.clinicId;
    });
    await a.get(OutboxWorker).drain();
    expect(clinic).toBe("clinic_b");
  });

  it("gives a row back when its lease runs out, and ignores the late worker's settle", async () => {
    await enqueue(1);
    let release: (() => void) | undefined;
    vi.spyOn(b.get(NoopHandler), "handle").mockImplementation(() => new Promise<void>((resolve) => (release = resolve)));
    const stuck = b.get(OutboxWorker).drain(); // claims (attempt 1) and hangs

    await vi.waitFor(() => expect(release).toBeDefined());
    clock.set(new Date(NOW.getTime() + OUTBOX_POLICY.leaseMs));
    expect(await a.get(OutboxWorker).drain()).toBe(1); // attempt 2 takes it over and settles

    release!();
    await stuck; // attempt 1 settles late: refused, attempts no longer match
    expect(await prisma.outboxMessage.findFirstOrThrow()).toMatchObject({ status: "done", attempts: 2 });
  });

  it("never lets a late worker's failure undo a newer claim's success", async () => {
    await enqueue(1);
    let fail: ((e: Error) => void) | undefined;
    vi.spyOn(b.get(NoopHandler), "handle").mockImplementation(() => new Promise<void>((_, reject) => (fail = reject)));
    const stuck = b.get(OutboxWorker).drain(); // claims (attempt 1) and hangs

    await vi.waitFor(() => expect(fail).toBeDefined());
    clock.set(new Date(NOW.getTime() + OUTBOX_POLICY.leaseMs));
    expect(await a.get(OutboxWorker).drain()).toBe(1); // attempt 2 takes it over and succeeds

    fail!(new Error("provider timeout"));
    await stuck; // attempt 1 would schedule a retry: refused, attempts no longer match
    expect(await prisma.outboxMessage.findFirstOrThrow()).toMatchObject({ status: "done", attempts: 2, lastError: null });
  });

  it("skips rows another worker holds locked, instead of waiting for them (SKIP LOCKED)", async () => {
    await enqueue(2);
    const [held] = await prisma.outboxMessage.findMany({ orderBy: { createdAt: "asc" }, select: { id: true } });
    let release!: () => void;
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM OutboxMessage WHERE id = ${held!.id} FOR UPDATE`;
        locked();
        await new Promise<void>((resolve) => (release = resolve));
      },
      { timeout: 30_000 },
    );
    await lockTaken;
    // Without SKIP LOCKED the claim waits on the held row until MySQL's lock-wait timeout (50 s) and this times out.
    const timeout = new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 5_000));
    expect(await Promise.race([a.get(OutboxWorker).drain(), timeout])).toBe(1); // the other row
    release();
    await holder;
    expect(await a.get(OutboxWorker).drain()).toBe(1); // the held row, once free
  });
});
