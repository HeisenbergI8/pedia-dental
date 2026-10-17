import type { INestApplication } from "@nestjs/common";
import { UnprocessableEntityException } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { IDEMPOTENCY_KEY_REUSED, type ReceiptSeries } from "@pedia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { BillingRecordsService } from "../../src/billing-records/billing-records.service";
import { IdempotencyService, isDuplicateKey, type KeyedRequest } from "../../src/idempotency/idempotency.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { runInTransaction } from "../../src/prisma/transaction";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** B8 E2 and E3 on MySQL: a key claimed in the write's transaction, and receipt numbers without gaps. */
const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;
let keys: IdempotencyService;
let records: BillingRecordsService;
beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  keys = app.get(IdempotencyService);
  records = app.get(BillingRecordsService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const demo = <T>(fn: () => Promise<T>) => inClinic(DEMO_CLINIC_ID, fn);
const request = (amount = 100): KeyedRequest => ({ route: "POST /test", params: { id: "x" }, actor: "u1", body: { amount } });
/** A write that takes the next number of a test series: one increment per run, visible in the counter. */
const TEST = "TS" as ReceiptSeries;
const counted = async (tx: Parameters<Parameters<IdempotencyService["once"]>[2]>[0]) => ({ status: 201, body: { no: await records.nextReceipt(tx, TEST) } });
const testCounter = () => demo(() => prisma.receiptCounter.findFirst({ where: { series: TEST }, select: { last: true } })).then((r) => r?.last ?? 0);

describe("Idempotency-Key on MySQL (B8 E2)", () => {
  it("keeps the answer with the write, and replays it without writing again", async () => {
    const key = crypto.randomUUID();
    const before = await testCounter();
    const first = await demo(() => keys.once(key, request(), counted));
    const second = await demo(() => keys.once(key, request(), counted));
    expect([first.replayed, second.replayed, second.status, second.body]).toEqual([false, true, 201, first.body]);
    expect(await testCounter()).toBe(before + 1);
    const row = await demo(() => prisma.idempotencyKey.findFirst({ where: { key }, select: { status: true, response: true, createdAt: true, expiresAt: true } }));
    expect({ status: row!.status, response: row!.response }).toEqual({ status: 201, response: first.body });
    // Raw SQL stores UTC, as Prisma's model writes do: no 8-hour shift from the Manila-pinned process.
    expect(Math.abs(row!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(24 * 60 * 60_000);
  });

  it("frees the key when the write is refused", async () => {
    const key = crypto.randomUUID();
    await expect(demo(() => keys.once(key, request(), async () => { throw new Error("refused"); }))).rejects.toThrow("refused");
    expect(await demo(() => prisma.idempotencyKey.count({ where: { key } }))).toBe(0);
    expect((await demo(() => keys.once(key, request(), counted))).replayed).toBe(false);
  });

  it("refuses the key for a different request", async () => {
    const key = crypto.randomUUID();
    await demo(() => keys.once(key, request(100), counted));
    await expect(demo(() => keys.once(key, request(200), counted))).rejects.toThrow(new UnprocessableEntityException(IDEMPOTENCY_KEY_REUSED));
  });

  it.each([0, 1, 2, 3, 4])("writes once for ten parallel requests with one key (round %i)", async () => {
    const key = crypto.randomUUID();
    const before = await testCounter();
    const answers = await Promise.all(Array.from({ length: 10 }, () => demo(() => keys.once(key, request(), counted))));
    expect(await testCounter()).toBe(before + 1);
    expect(answers.filter((a) => a.replayed)).toHaveLength(9);
    expect(new Set(answers.map((a) => JSON.stringify(a.body))).size).toBe(1);
  });

  it("scopes a key to its clinic", async () => {
    const key = crypto.randomUUID();
    const a = await demo(() => keys.once(key, request(), counted));
    const b = await inClinic("clinic_ngiti", () => keys.once(key, request(), counted));
    expect([a.replayed, b.replayed]).toEqual([false, false]);
  });

  it("treats an expired key as new, and sweeps only expired keys, a thousand at a time", async () => {
    const key = crypto.randomUUID();
    await demo(() => keys.once(key, request(), counted));
    const past = new Date(Date.now() - 1000);
    await demo(() => prisma.idempotencyKey.updateMany({ where: { key }, data: { expiresAt: past } }));
    expect((await demo(() => keys.once(key, request(), counted))).replayed).toBe(false);

    const live = await demo(() => prisma.idempotencyKey.count());
    const old = (clinicId: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ clinicId, key: `old-${clinicId}-${i}`, fingerprint: "0".repeat(64), status: 201, createdAt: past, expiresAt: past }));
    // Seeded straight in, outside any clinic: the test's own rows.
    for (const [clinicId, n] of [[DEMO_CLINIC_ID, 2000], ["clinic_ngiti", 500]] as const) {
      await inClinic(clinicId, () => prisma.idempotencyKey.createMany({ data: old(clinicId, n).map(({ clinicId: _, ...r }) => r) }));
    }
    expect(await keys.sweep()).toBe(2500);
    expect(await demo(() => prisma.idempotencyKey.count())).toBe(live); // the live ones stay
  });

  it("recognises MySQL's duplicate key on a raw insert (the shape `once` relies on)", async () => {
    const key = crypto.randomUUID();
    await demo(() => keys.once(key, request(), counted));
    const error = await demo(() =>
      runInTransaction(prisma, (tx) => tx.$executeRaw`INSERT INTO IdempotencyKey (clinicId, \`key\`, fingerprint, status, createdAt, expiresAt)
        VALUES (${DEMO_CLINIC_ID}, ${key}, ${"0".repeat(64)}, 0, NOW(), NOW())`),
    ).catch((e: unknown) => e);
    expect(isDuplicateKey(error)).toBe(true);
    expect((error as { code: string }).code).toMatch(/^P20(02|10)$/);
  });
});

describe("receipt numbers on MySQL (B8 E3)", () => {
  const n = (no: string) => Number(no.slice(3));

  it("numbers twenty parallel payments one after another, from the seed's last", async () => {
    const seeded = await demo(() => prisma.receiptCounter.findFirst({ where: { series: "AR" }, select: { last: true } }));
    const got = await Promise.all(Array.from({ length: 20 }, () => demo(() => runInTransaction(prisma, (tx) => records.nextReceipt(tx, "AR")))));
    expect(got.map(n).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => seeded!.last + 1 + i));
  });

  it("gives a rolled-back number back, so the committed ones have no gap", async () => {
    const start = (await demo(() => prisma.receiptCounter.findFirst({ where: { series: "AR" }, select: { last: true } })))!.last;
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) =>
      demo(() => runInTransaction(prisma, async (tx) => {
        const no = await records.nextReceipt(tx, "AR");
        if (i % 2) throw new Error("refused after numbering");
        return no;
      })),
    ));
    const kept = results.flatMap((r) => (r.status === "fulfilled" ? [n(r.value)] : [])).sort((a, b) => a - b);
    expect(kept).toEqual([start + 1, start + 2, start + 3, start + 4, start + 5]);
    expect((await demo(() => prisma.receiptCounter.findFirst({ where: { series: "AR" }, select: { last: true } })))!.last).toBe(start + 5);
  });

  it("starts a clinic with no receipts at 000001", async () => {
    const next = () => inClinic("clinic_ngiti", () => runInTransaction(prisma, (tx) => records.nextReceipt(tx, "CR")));
    expect([await next(), await next()]).toEqual(["CR-000001", "CR-000002"]);
  });
});
