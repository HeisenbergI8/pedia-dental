import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { SEED_PRICES, seedPlatform } from "@pedia/seed";
import { PaymentQrView, PriceList } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PlatformSettingsService } from "../../src/platform-settings/platform-settings.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { FileStorage } from "../../src/storage/storage";
import { resetDatabase } from "./support/database";
import { binary } from "./support/files";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** B12 Step 5.4: the price list (decision 11) and Primolar's payment QR (decisions 5, 23) on MySQL. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b12-settings-"));
const clock = new FixedClock(new Date("2026-10-15T09:00:00+08:00"));
let app: INestApplication;
let prisma: PrismaService;
let op = "";

beforeAll(async () => {
  app = await createIntApp({ clock, env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  op = await asOperator(app); // the tests move the clock a day at a time, past an operator session's idle limit
});

const http = () => request(app.getHttpServer());
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1");
const raise = (list: PriceList, by: number): PriceList => ({ ...list, plans: { ...list.plans, small: { ...list.plans.small, monthlyFee: list.plans.small.monthlyFee + by } } });
const putQr = (caption: string, file?: Buffer, type = "image/png") => {
  const req = http().put("/api/operator/payment-qr").set("Cookie", op).field("data", JSON.stringify({ caption }));
  return file ? req.attach("file", file, { filename: "qr", contentType: type }) : req;
};

describe("the price list on MySQL (B12 decision 11)", () => {
  it("is public for the form and the operator's to read", async () => {
    expect(PriceList.parse((await http().get("/api/signups/prices")).body)).toEqual(SEED_PRICES);
    expect((await http().get("/api/operator/prices").set("Cookie", op)).body).toEqual(SEED_PRICES);
  });

  it("keeps the list in force before each change, so a month that began before keeps its price", async () => {
    const service = app.get(PlatformSettingsService);
    const first = raise(SEED_PRICES, 10_000);
    expect((await http().put("/api/operator/prices").set("Cookie", op).send(first)).body).toEqual(first);
    expect((await http().put("/api/operator/prices").set("Cookie", op).send(raise(SEED_PRICES, 20_000))).status).toBe(200);
    expect(await prisma.priceChange.count()).toBe(1); // one per day: it holds the list before the day's first change
    expect(await service.monthlyFee("small", "2026-10-14")).toBe(SEED_PRICES.plans.small.monthlyFee);
    expect(await service.monthlyFee("small", "2026-10-15")).toBe(SEED_PRICES.plans.small.monthlyFee + 20_000);
    // A change the next day keeps the list in force before it.
    clock.set(new Date("2026-10-16T09:00:00+08:00"));
    op = await asOperator(app);
    await http().put("/api/operator/prices").set("Cookie", op).send(raise(SEED_PRICES, 25_000));
    expect(await prisma.priceChange.count()).toBe(2);
    expect(await service.monthlyFee("small", "2026-10-15")).toBe(SEED_PRICES.plans.small.monthlyFee + 20_000);
    expect(await service.monthlyFee("small", "2026-10-14")).toBe(SEED_PRICES.plans.small.monthlyFee);
  });

  it("refuses a negative fee with the schema's issues", async () => {
    const res = await http().put("/api/operator/prices").set("Cookie", op).send(raise(SEED_PRICES, -10_000_000));
    expect(res.status).toBe(400);
    expect((await http().put("/api/operator/prices").set("Cookie", op).send({ ...SEED_PRICES, designAddOn: 10.5 })).status).toBe(400);
  });

  it("serialises parallel saves on the platform lock: five saves on a new day, one change, no deadlock", async () => {
    clock.set(new Date("2026-10-17T09:00:00+08:00"));
    op = await asOperator(app);
    const before = await prisma.priceChange.count();
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => http().put("/api/operator/prices").set("Cookie", op).send(raise(SEED_PRICES, 30_000 + n))));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.priceChange.count()).toBe(before + 1);
    expect(await app.get(PlatformSettingsService).monthlyFee("small", "2026-10-16")).toBe(SEED_PRICES.plans.small.monthlyFee + 25_000);
  });
});

describe("Primolar's payment QR on MySQL (B12 decisions 5, 23)", () => {
  it("is absent at first: null for the operator, 404 for the public image", async () => {
    expect((await http().get("/api/operator/payment-qr").set("Cookie", op)).body).toBeNull();
    const res = await http().get("/api/signups/payment-qr/image");
    expect([res.status, res.text]).toEqual([404, "Primolar hasn't added payment details yet"]);
    expect([(await putQr("caption only")).status, (await putQr("caption only")).text]).toEqual([400, "Add the QR image"]);
  });

  it("stores an upload, keeps it on a caption-only save, and serves it publicly through a 302", async () => {
    const saved = await putQr("GCash 0917 000 0000", PNG);
    expect(saved.status).toBe(200);
    expect(PaymentQrView.parse(saved.body).caption).toBe("GCash 0917 000 0000");
    const { paymentQrKey: key } = await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } });
    expect(key).toMatch(/^platform\/payment-qr\//);
    clock.set(new Date("2026-10-17T09:05:00+08:00"));
    expect((await putQr("")).body).toEqual({ caption: null, updatedAt: "2026-10-17T01:05:00.000Z" });
    expect((await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } })).paymentQrKey).toBe(key);
    const first = await http().get("/api/signups/payment-qr/image");
    expect(first.status).toBe(302);
    const image = await http().get(first.headers.location!).buffer(true).parse(binary);
    expect([image.status, (image.body as Buffer).equals(PNG)]).toEqual([200, true]);
  });

  it("deletes the old image once a replacement commits (the worker, through the outbox)", async () => {
    const { paymentQrKey: old } = await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } });
    expect((await putQr("new", PNG)).status).toBe(200);
    await app.get(OutboxWorker).drain();
    expect(await app.get(FileStorage).get(old!)).toBeUndefined();
  });

  it("refuses a GIF (400) and an image over 2 MB (413) with the mock's words, storing nothing", async () => {
    const before = await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } });
    const gif = await putQr("x", GIF, "image/gif");
    expect([gif.status, gif.text]).toEqual([400, "Choose a PNG, JPG or WebP image"]);
    const big = await putQr("x", Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
    expect([big.status, big.text]).toEqual([413, "The image must be 2 MB or smaller"]);
    expect((await prisma.platformSettings.findUniqueOrThrow({ where: { id: "primolar" } })).paymentQrKey).toBe(before.paymentQrKey);
  });
});
