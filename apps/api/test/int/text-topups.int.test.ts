import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { SEED_PRICES, seedPlatform } from "@pedia/seed";
import { ClinicUsage, RECEIPT_PENDING, ReceiptToCheck, SubscriptionView, TOPUP_PAUSED, TextTopUpsView } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { FileStorage } from "../../src/storage/storage";
import { UsageService } from "../../src/usage/usage.service";
import { signIn } from "./support/clinic-login";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** apps/web's payments.test.ts → "text top-ups (feature 16, revised)", on MySQL, with the races. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "topups-"));
const NGITI = "clinic_ngiti";
let app: INestApplication;
let prisma: PrismaService;
let op = "";
let owner = "";

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform(), app.get(FileStorage));
  op = await asOperator(app);
  owner = (await signIn(app, "owner@ngiti.demo")).cookie;
}, 60_000);

const http = () => request(app.getHttpServer());
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const topUp = (packs: number, reference = "GC 7001", cookie = owner) =>
  http().post("/api/clinic/text-topups/receipts").set("Cookie", cookie)
    .field("data", JSON.stringify({ packs, reference })).attach("file", PNG, { filename: "r.png", contentType: "image/png" });
const get = <T>(path: string, schema: { parse: (v: unknown) => T }, cookie = owner) => http().get(`/api${path}`).set("Cookie", cookie).then((r) => schema.parse(r.body));
const toCheck = () => get("/operator/receipts", ReceiptToCheck.array(), op);

describe("text top-ups (feature 16, revised)", () => {
  it("sells packs by QR, puts them first in Payments to check, and adds the parts to this month once confirmed", async () => {
    const before = await get("/clinic/usage", ClinicUsage);
    const view = await get("/clinic/text-topups", TextTopUpsView);
    expect([view.pack, view.partsThisMonth]).toEqual([SEED_PRICES.textPack, 0]);
    const sent = await topUp(2);
    expect(sent.status, sent.text).toBe(201);
    expect(TextTopUpsView.parse(sent.body).receipts[0]).toMatchObject({ status: "pending", packs: 2, parts: 200, amountDue: 2 * SEED_PRICES.textPack.price });
    const again = await topUp(1);
    expect([again.status, again.text]).toEqual([409, RECEIPT_PENDING]); // one waits at a time (decision 21)

    const [first, second] = await toCheck(); // Ipin's seeded monthly receipt waits too, and is older
    expect(first!.payer).toMatchObject({ kind: "text_topup", clinicId: NGITI, clinicName: "Ngiti Kids Dental" }); // D14
    expect(second!.payer.kind).toBe("subscription");
    const confirmed = await http().post(`/api/operator/receipts/${first!.id}/confirm`).set("Cookie", op).send({ method: "gcash", paidOn: "2026-10-18" });
    expect(confirmed.status, confirmed.text).toBe(200);

    const after = await get("/clinic/usage", ClinicUsage);
    expect([after.textTopUp, after.texts.limit]).toEqual([200, before.texts.limit! + 200]);
    expect((await get("/clinic/text-topups", TextTopUpsView)).partsThisMonth).toBe(200);
    const [bought] = (await get("/clinic/subscription", SubscriptionView)).topUps; // on the books (D10)
    expect(bought).toMatchObject({ packs: 2, parts: 200, method: "gcash", reference: "GC 7001", invoiceNo: expect.stringMatching(/^PRM-INV-\d{5}$/) });
  });

  it("shows a rejected top-up's reason, and takes a new one after it", async () => {
    await topUp(1, "GC 7002");
    const id = (await toCheck()).find((r) => r.payer.kind === "text_topup")!.id;
    await http().post(`/api/operator/receipts/${id}/reject`).set("Cookie", op).send({ reason: "The amount on the receipt is ₱100" });
    expect((await get("/clinic/text-topups", TextTopUpsView)).receipts[0]).toMatchObject({ status: "rejected", rejectionReason: "The amount on the receipt is ₱100" });
    expect((await topUp(1, "GC 7003")).status).toBe(201);
  });

  it("takes a monthly receipt while a top-up waits, each in its own slot", async () => {
    expect((await topUp(1, "GC 7101")).status).toBe(201);
    const month = await http().post("/api/clinic/subscription/receipts").set("Cookie", owner)
      .field("data", JSON.stringify({ reference: "GC 7102" })).attach("file", PNG, { filename: "r.png", contentType: "image/png" });
    expect(month.status, month.text).toBe(201); // decision 21: one waiting receipt per payer
    expect(await prisma.paymentReceipt.count({ where: { clinicId: NGITI, status: "pending" } })).toBe(2);
  });

  it("confirms a top-up at the pack price it was sent at, even after the price changes", async () => {
    await topUp(1, "GC 7201");
    const [receipt] = (await toCheck()).filter((r) => r.payer.kind === "text_topup");
    const prices = (await http().get("/api/operator/prices").set("Cookie", op)).body;
    const raised = await http().put("/api/operator/prices").set("Cookie", op).send({ ...prices, textPack: { parts: 50, price: prices.textPack.price * 2 } });
    expect(raised.status, raised.text).toBe(200);
    expect((await http().post(`/api/operator/receipts/${receipt!.id}/confirm`).set("Cookie", op).send({ method: "gcash", paidOn: "2026-10-18" })).status).toBe(200);
    const row = await prisma.textTopUp.findUniqueOrThrow({ where: { receiptId: receipt!.id } });
    expect([row.packs, row.parts, row.amount]).toEqual([1, receipt!.parts, receipt!.amountDue]); // D3: the quoted pack holds
  });

  it("counts a top-up only in the month it was confirmed for, never the next", async () => {
    await prisma.textTopUp.create({
      data: { clinicId: NGITI, month: "2026-10", packs: 1, parts: 100, invoiceNo: "PRM-INV-09998", method: "gcash", paidOn: new Date("2026-10-31T00:00:00Z"), amount: 15_000, recordedAt: new Date() },
    });
    const usage = app.get(UsageService);
    expect([(await usage.forClinic(NGITI, "2026-10")).textTopUp, (await usage.forClinic(NGITI, "2026-11")).textTopUp]).toEqual([100, 0]); // D1
  });

  it("is the Owner's only", async () => {
    const desk = (await signIn(app, "frontdesk@gmail.com")).cookie;
    expect((await http().get("/api/clinic/text-topups").set("Cookie", desk)).status).toBe(403);
    expect((await topUp(1, "GC 7004", desk)).status).toBe(403);
  });

  it("takes exactly one of two top-ups sent at once", async () => {
    const results = await Promise.all([topUp(1, "GC A"), topUp(1, "GC B")]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.paymentReceipt.count({ where: { purpose: "text_topup", clinicId: NGITI, status: "pending" } })).toBe(1);
  });

  it("refuses a top-up while the clinic is paused for its monthly fee (D8)", async () => {
    await prisma.subscription.update({ where: { clinicId: NGITI }, data: { pause: "overdue" } });
    const res = await topUp(1);
    expect([res.status, res.text]).toEqual([409, TOPUP_PAUSED]);
    expect(await prisma.paymentReceipt.count({ where: { purpose: "text_topup" } })).toBe(0);
  });
});
