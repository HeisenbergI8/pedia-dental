import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, SEED_PRICES, seedPlatform } from "@pedia/seed";
import { RECEIPT_PENDING, ReceiptToCheck, SignupStatusView, SubscriptionView } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { SignupsService } from "../../src/signups/signups.service";
import { FileStorage } from "../../src/storage/storage";
import { resetDatabase } from "./support/database";
import { signIn } from "./support/clinic-login";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** B12 Step 7.5: every receipt route on MySQL (decisions 6–8, 15, 21–24), with the races. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b12-receipts-"));
const IPIN = "clinic_ipin";
const SEEDED = "receipt_seed_ipin";
const HAGIKGIK = "PRM-HGK2-7QXM";
const start = Date.now();
const clock = new FixedClock(new Date(start));
let app: INestApplication;
let prisma: PrismaService;
let op = "";

beforeAll(async () => {
  app = await createIntApp({ clock, env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  clock.set(new Date(start));
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform(), app.get(FileStorage));
  await prisma.platformSettings.update({ where: { id: "primolar" }, data: { paymentQrKey: "platform/payment-qr/qr.png", paymentQrUpdatedAt: new Date(start) } });
  op = await asOperator(app);
}, 60_000);

const http = () => request(app.getHttpServer());
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const upload = (req: request.Test, reference: string) => req.field("data", JSON.stringify({ reference })).attach("file", PNG, { filename: "r.png", contentType: "image/png" });
const confirm = (id: string) => http().post(`/api/operator/receipts/${id}/confirm`).set("Cookie", op).send({ method: "gcash", paidOn: clock.today() });
const reject = (id: string, reason = "The amount is short") => http().post(`/api/operator/receipts/${id}/reject`).set("Cookie", op).send({ reason });
const ownerOfIpin = async () => (await signIn(app, "owner@ipin.demo")).cookie;

describe("the Owner's receipts (decisions 6, 21, 24)", () => {
  it("confirming Ipin's seeded receipt records its month, lifts nothing it shouldn't, and empties Payments to check", async () => {
    const before = ReceiptToCheck.array().parse((await http().get("/api/operator/receipts").set("Cookie", op)).body);
    expect(before.map((r) => [r.id, r.payer.clinicName])).toEqual([[SEEDED, "Ipin Kids Dental"]]);
    const res = await confirm(SEEDED);
    expect(ReceiptToCheck.parse(res.body).status).toBe("confirmed");
    expect((await http().get("/api/operator/receipts").set("Cookie", op)).body).toEqual([]);
    const pay = await prisma.subscriptionPayment.findFirstOrThrow({ where: { receiptId: SEEDED } });
    expect([pay.reference, pay.amount]).toEqual(["GC 5012 3344 7781", SEED_PRICES.plans.small.monthlyFee]);
  });

  it("lifts a lapsed clinic's pause when its receipt is confirmed", async () => {
    clock.set(new Date(start + 5 * 86_400_000)); // 8 days past due
    await signIn(app, "owner@ipin.demo"); // the check at sign-in pauses it
    expect((await prisma.clinicAccount.findUniqueOrThrow({ where: { id: IPIN } })).status).toBe("suspended");
    op = await asOperator(app);
    expect((await confirm(SEEDED)).status).toBe(200);
    expect((await prisma.clinicAccount.findUniqueOrThrow({ where: { id: IPIN } })).status).toBe("active");
  });

  it("confirms once of two at once", async () => {
    const results = await Promise.all([confirm(SEEDED), confirm(SEEDED)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.text).toBe("This receipt has already been checked");
    expect(await prisma.subscriptionPayment.count({ where: { receiptId: SEEDED } })).toBe(1);
  });

  it("keeps one receipt waiting at a time: three uploads at once after a rejection, one pending", async () => {
    expect((await reject(SEEDED)).status).toBe(200);
    const cookie = await ownerOfIpin();
    const view = SubscriptionView.parse((await http().get("/api/clinic/subscription").set("Cookie", cookie)).body);
    expect([view.receipts[0]!.status, view.receipts[0]!.rejectionReason]).toEqual(["rejected", "The amount is short"]);
    const results = await Promise.all([1, 2, 3].map((n) => upload(http().post("/api/clinic/subscription/receipts").set("Cookie", cookie), `GC-${n}`)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)!.text).toBe(RECEIPT_PENDING);
    expect(await prisma.paymentReceipt.count({ where: { clinicId: IPIN, status: "pending" } })).toBe(1);
  });

  it("pays a month exactly once when a receipt's confirm races a payment by hand", async () => {
    const month = (await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: SEEDED } })).periodStart!;
    const [byReceipt, byHand] = await Promise.all([
      confirm(SEEDED),
      http().post(`/api/operator/accounts/${IPIN}/subscription/payments`).set("Cookie", op).send({ method: "cash", paidOn: clock.today() }),
    ]);
    expect(byHand.status).toBe(201);
    expect([200, 409]).toContain(byReceipt.status);
    expect(await prisma.subscriptionPayment.count({ where: { clinicId: IPIN, periodStart: month } })).toBe(1);
  });

  it("refuses a receipt whose month's price changed since it was sent (a month that starts after the change)", async () => {
    const owner = (await signIn(app, "owner@gmail.com", DEMO_CLINIC_ID)).cookie; // Bulilit: paid up, its next month starts in ~12 days
    expect((await upload(http().post("/api/clinic/subscription/receipts").set("Cookie", owner), "GC-AHEAD")).status).toBe(201);
    const raised = { ...SEED_PRICES, plans: { ...SEED_PRICES.plans, mid: { ...SEED_PRICES.plans.mid, monthlyFee: SEED_PRICES.plans.mid.monthlyFee + 10_000 } } };
    expect((await http().put("/api/operator/prices").set("Cookie", op).send(raised)).status).toBe(200);
    const sent = await prisma.paymentReceipt.findFirstOrThrow({ where: { clinicId: DEMO_CLINIC_ID, status: "pending" } });
    const res = await confirm(sent.id);
    expect([res.status, res.text]).toEqual([409, "The amount due has changed since this receipt was sent. Reject it and ask for a new one."]);
  });

  it("serves a receipt's image to its own clinic and the operator only", async () => {
    const ipin = await ownerOfIpin();
    expect((await http().get(`/api/clinic/subscription/receipts/${SEEDED}/image`).set("Cookie", ipin)).status).toBe(302);
    expect((await http().get(`/api/operator/receipts/${SEEDED}/image`).set("Cookie", op)).status).toBe(302);
    const bulilit = (await signIn(app, "owner@gmail.com", DEMO_CLINIC_ID)).cookie;
    const other = await http().get(`/api/clinic/subscription/receipts/${SEEDED}/image`).set("Cookie", bulilit);
    expect([other.status, other.text]).toEqual([404, "Receipt not found"]);
    const desk = (await signIn(app, "frontdesk@gmail.com", DEMO_CLINIC_ID)).cookie;
    expect((await http().get("/api/clinic/subscription").set("Cookie", desk)).status).toBe(403); // clinic.manage only
  });
});

describe("a sign-up's receipt (decision 7) and the purge (decision 15)", () => {
  it("records the setup fee when confirmed, after which Approve works", async () => {
    const sent = await upload(http().post(`/api/signups/${HAGIKGIK}/receipts`), "BPI-77");
    expect(SignupStatusView.parse(sent.body).receipt?.status).toBe("pending");
    const [receipt] = ReceiptToCheck.array().parse((await http().get("/api/operator/receipts").set("Cookie", op)).body).filter((r) => r.payer.kind === "signup");
    expect(receipt!.payer).toMatchObject({ kind: "signup", signupReference: HAGIKGIK, clinicName: "Hagikgik Kids Dental" });
    expect((await confirm(receipt!.id)).status).toBe(200);
    const view = SignupStatusView.parse((await http().get(`/api/signups/${HAGIKGIK}`)).body);
    expect([view.paid, view.receipt?.status]).toEqual([true, "confirmed"]);
    expect((await http().post(`/api/operator/signups/signup_hagikgik/approve`).set("Cookie", op)).status).toBe(201);
  });

  it("refuses an 11th sign-up receipt from one address within the hour", async () => {
    await prisma.rateLimitCounter.deleteMany();
    for (let i = 0; i < 10; i++) await upload(http().post(`/api/signups/${HAGIKGIK}/receipts`), `R-${i}`);
    const res = await upload(http().post(`/api/signups/${HAGIKGIK}/receipts`), "R-11");
    expect([res.status, res.text]).toEqual([429, "Too many receipts from this connection. Try again in an hour."]);
  });

  it("deletes a rejected sign-up's files 30 days on, keeping its record and receipts' rows", async () => {
    await upload(http().post(`/api/signups/${HAGIKGIK}/receipts`), "BPI-1");
    const { fileKey } = await prisma.paymentReceipt.findFirstOrThrow({ where: { signupId: "signup_hagikgik" } });
    expect((await http().post("/api/operator/signups/signup_hagikgik/reject").set("Cookie", op).send({ reason: "Duplicate" })).status).toBe(200);
    const signups = app.get(SignupsService);
    clock.set(new Date(start + 29 * 86_400_000));
    expect(await signups.purgeRejectedFiles()).toBe(0);
    clock.set(new Date(start + 31 * 86_400_000));
    expect(await signups.purgeRejectedFiles()).toBe(1);
    expect(await signups.purgeRejectedFiles()).toBe(0); // idempotent
    const row = await prisma.signup.findUniqueOrThrow({ where: { id: "signup_hagikgik" } });
    expect([row.status, row.filesDeletedAt !== null, row.referenceKeys]).toEqual(["rejected", true, []]);
    expect((await prisma.paymentReceipt.findFirstOrThrow({ where: { signupId: "signup_hagikgik" } })).fileKey).toBeNull();
    clock.set(new Date(start)); // the worker claims rows due by the real time
    await prisma.outboxMessage.deleteMany({ where: { kind: { not: "storage.delete" } } }); // the seed's queued texts come first in a batch
    await prisma.outboxMessage.updateMany({ data: { availableAt: new Date(start - 60_000) } });
    await app.get(OutboxWorker).drain();
    expect(await app.get(FileStorage).get(fileKey!)).toBeUndefined();
  });
});
