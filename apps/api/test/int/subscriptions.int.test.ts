import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, SEED_PRICES, seedPlatform, staffEmail } from "@pedia/seed";
import { BILLING_ONLY_MESSAGE, RECEIPT_PENDING, Session, SubscriptionView, type PriceList } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { SubscriptionRecordsService } from "../../src/subscription-records/subscription-records.service";
import { resetDatabase } from "./support/database";
import { signIn } from "./support/clinic-login";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/**
 * apps/web's mocks/subscriptions.test.ts against the API (B12 Step 7.5): the nightly settle, the check at sign-in, the
 * billing-only session (decision 25), payments, plan changes and their races. The seed's dates follow today, so the
 * clock moves from now: Ipin is 3 days past due, Ngiti due in 2 days, Bulilit in about 12.
 */
const platform = seedPlatform();
const IPIN = "clinic_ipin";
const NGITI = "clinic_ngiti";
const ngiti = platform.tenants[NGITI]!;
const NGITI_OWNER = staffEmail(ngiti.staff.find((s) => s.isOwner)!);
const NGITI_DESK = staffEmail(ngiti.staff.find((s) => s.role === "front_desk")!);
const IPIN_OWNER = "owner@ipin.demo";
const start = Date.now();
const clock = new FixedClock(new Date(start));
const daysOn = (n: number) => clock.set(new Date(start + n * 86_400_000));
let app: INestApplication;
let prisma: PrismaService;
let records: SubscriptionRecordsService;

beforeAll(async () => {
  app = await createIntApp({ clock });
  prisma = app.get(PrismaService);
  records = app.get(SubscriptionRecordsService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  daysOn(0);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);

const http = () => request(app.getHttpServer());
const account = (id: string) => prisma.clinicAccount.findUniqueOrThrow({ where: { id }, select: { status: true, tier: true } });
const pauseOf = async (id: string) => (await prisma.subscription.findUniqueOrThrow({ where: { clinicId: id } })).pause;
const payByHand = async (id: string) => http().post(`/api/operator/accounts/${id}/subscription/payments`).set("Cookie", await asOperator(app)).send({ method: "gcash", paidOn: clock.today() });
const raiseSmall = (by: number): PriceList => ({ ...SEED_PRICES, plans: { ...SEED_PRICES.plans, small: { ...SEED_PRICES.plans.small, monthlyFee: SEED_PRICES.plans.small.monthlyFee + by } } });

describe("the nightly settle and the check at sign-in (decision 4)", () => {
  it("pauses a clinic 8 days past due and not one 7 days past", async () => {
    daysOn(4); // Ipin: 7 days past due, the last day of grace
    await records.settleAll();
    expect(await account(IPIN)).toMatchObject({ status: "active" });
    daysOn(5); // 8 days past due
    await records.settleAll();
    expect(await account(IPIN)).toMatchObject({ status: "suspended" });
    expect(await pauseOf(IPIN)).toBe("overdue");
  });

  it("settles twice to the same thing: the second run changes nothing", async () => {
    daysOn(5);
    await records.settleAll();
    const after = [await account(IPIN), await prisma.subscription.findMany({ orderBy: { clinicId: "asc" } })];
    await records.settleAll();
    expect([await account(IPIN), await prisma.subscription.findMany({ orderBy: { clinicId: "asc" } })]).toEqual(after);
  });

  it("pauses at sign-in before the job runs: front desk refused, the Owner signs in to pay only, a parent reads", async () => {
    daysOn(10); // Ngiti: 8 days past due; the job hasn't run
    const desk = await signIn(app, NGITI_DESK, NGITI);
    expect([desk.res.status, desk.res.text]).toEqual([403, "Your clinic's Primolar account is paused. Contact your clinic."]);
    expect(await account(NGITI)).toMatchObject({ status: "suspended" });

    const owner = await signIn(app, NGITI_OWNER, NGITI);
    expect(Session.parse(owner.res.body).user).toMatchObject({ billingOnly: true });
    expect(owner.res.body.user.readOnly).toBeUndefined();
    const refused = await http().get("/api/patients").set("Cookie", owner.cookie);
    expect([refused.status, refused.text]).toEqual([403, BILLING_ONLY_MESSAGE]);
    for (const path of ["/api/clinic", "/api/clinic/usage", "/api/clinic/subscription"]) {
      expect((await http().get(path).set("Cookie", owner.cookie)).status, path).toBe(200);
    }

    const guardian = await prisma.credential.findFirstOrThrow({ where: { clinicId: NGITI, guardianId: { not: null }, phone: { not: null } } });
    const parent = await signIn(app, guardian.phone!, NGITI);
    expect(Session.parse(parent.res.body).user).toMatchObject({ readOnly: true });
  });

  it("lets a paid Owner's next request be a full session again (decision 25)", async () => {
    daysOn(5); // Ipin lapsed
    const owner = await signIn(app, IPIN_OWNER);
    expect(owner.res.body.user.billingOnly).toBe(true);
    expect((await http().get("/api/patients").set("Cookie", owner.cookie)).status).toBe(403);
    // The receipt route is theirs to reach (here: Ipin's seeded receipt is still waiting, decision 21).
    const sent = await http().post("/api/clinic/subscription/receipts").set("Cookie", owner.cookie)
      .field("data", JSON.stringify({ reference: "GC-9" })).attach("file", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"), { filename: "r.png", contentType: "image/png" });
    expect([sent.status, sent.text]).toEqual([409, RECEIPT_PENDING]);
    // A month paid by hand: back within grace, so its own pause lifts at once.
    expect((await payByHand(IPIN)).status).toBe(201);
    expect(await account(IPIN)).toMatchObject({ status: "active" });
    expect((await http().get("/api/patients").set("Cookie", owner.cookie)).status).toBe(200);
    expect((await http().get("/api/auth/me").set("Cookie", owner.cookie)).body.billingOnly).toBeUndefined();
  });

  it("never lets a pause made by hand be lifted by a payment, nor a manually paused clinic's Owner in", async () => {
    const op = await asOperator(app);
    expect((await http().post(`/api/operator/accounts/${DEMO_CLINIC_ID}/suspend`).set("Cookie", op)).status).toBe(200);
    expect((await payByHand(DEMO_CLINIC_ID)).status).toBe(201);
    expect(await account(DEMO_CLINIC_ID)).toMatchObject({ status: "suspended" });
    const owner = await signIn(app, "owner@gmail.com", DEMO_CLINIC_ID);
    expect(owner.res.status).toBe(403);
  });
});

describe("payments and prices (billing #29, decision 11)", () => {
  it("keeps an overdue month's price after a price rise; the next month pays the new one", async () => {
    const op = await asOperator(app);
    expect((await http().put("/api/operator/prices").set("Cookie", op).send(raiseSmall(50_000))).status).toBe(200);
    const view = SubscriptionView.parse((await http().get(`/api/operator/accounts/${IPIN}/subscription`).set("Cookie", op)).body);
    expect(view.nextAmount).toBe(SEED_PRICES.plans.small.monthlyFee); // the month began before the change
    const paid = SubscriptionView.parse((await payByHand(IPIN)).body);
    expect(paid.payments[0]!.amount).toBe(SEED_PRICES.plans.small.monthlyFee);
    expect(paid.nextAmount).toBe(SEED_PRICES.plans.small.monthlyFee + 50_000);
  });

  it("serialises parallel payments: consecutive months, never one month twice, gapless invoice numbers across clinics", async () => {
    const before = await prisma.subscriptionPayment.count();
    const results = await Promise.all([...[1, 2, 3].map(() => payByHand(IPIN)), ...[1, 2].map(() => payByHand(NGITI))]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const rows = await prisma.subscriptionPayment.findMany({ orderBy: { invoiceNo: "asc" } });
    expect(rows).toHaveLength(before + 5);
    const numbers = rows.map((r) => Number(r.invoiceNo.slice(-5)));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    const ipinMonths = rows.filter((r) => r.clinicId === IPIN).map((r) => r.periodStart.toISOString());
    expect(new Set(ipinMonths).size).toBe(ipinMonths.length);
  });
});

describe("plan changes (billing #27, decision 12, E13)", () => {
  it("refuses a downgrade the clinic doesn't fit; schedules one it does; and holds additions to it while it waits", async () => {
    const op = await asOperator(app);
    const over = await http().put(`/api/operator/accounts/${DEMO_CLINIC_ID}/tier`).set("Cookie", op).send({ tier: "small" });
    expect(over.status).toBe(409);
    expect(over.text).toMatch(/the Owner must archive branches or deactivate logins before the plan can go down/);

    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "mid" })).status).toBe(200);
    expect(await account(NGITI)).toMatchObject({ tier: "mid" });
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "small" })).status).toBe(200);
    const view = SubscriptionView.parse((await http().get(`/api/operator/accounts/${NGITI}/subscription`).set("Cookie", op)).body);
    expect(view.downgrade?.tier).toBe("small");
    expect(await account(NGITI)).toMatchObject({ tier: "mid" });

    // E13: Ngiti has 1 branch; on Mid it could add one, but the waiting Small plan holds it at 1.
    const owner = await signIn(app, NGITI_OWNER, NGITI);
    const cookie = owner.cookie;
    const add = await http().post("/api/branches").set("Cookie", cookie).send({ name: "Imus", address: "1 Imus", phone: "(046) 000 0000", openingHours: ngiti.branches[0]!.openingHours });
    expect([add.status, add.text]).toEqual([409, "Your Small plan includes 1 branch. Contact Primolar to upgrade."]);
  });

  it("cancels once, pausing at the paid month's end; a cancelled subscription takes no more payments", async () => {
    const op = await asOperator(app);
    const cancelled = SubscriptionView.parse((await http().post(`/api/operator/accounts/${DEMO_CLINIC_ID}/subscription/cancel`).set("Cookie", op)).body);
    expect(cancelled.state).toBe("ending");
    expect((await http().post(`/api/operator/accounts/${DEMO_CLINIC_ID}/subscription/cancel`).set("Cookie", op)).status).toBe(409);
    const paid = await payByHand(DEMO_CLINIC_ID);
    expect([paid.status, paid.text]).toEqual([409, "This subscription is cancelled, so Primolar records no more payments for it."]);
  });

  it("refuses to reactivate a lapsed clinic until it pays", async () => {
    daysOn(5);
    await records.settleAll();
    const op = await asOperator(app);
    const res = await http().post(`/api/operator/accounts/${IPIN}/reactivate`).set("Cookie", op);
    expect([res.status, res.text]).toEqual([409, "This clinic's Primolar payment is past its grace period. Record the payment to reactivate it."]);
  });
});
