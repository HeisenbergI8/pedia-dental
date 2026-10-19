import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, SEED_PRICES, seedPlatform, staffEmail } from "@pedia/seed";
import { BILLING_ONLY_MESSAGE, RECEIPT_PENDING, Session, SubscriptionView, amountDue, type PriceList } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { SubscriptionRecordsService } from "../../src/subscription-records/subscription-records.service";
import { inClinic, resetDatabase } from "./support/database";
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

  it("shows only the Owner the overdue state, with the date to pay by, for seven days", async () => {
    daysOn(4);
    const payBy = clock.today(); // Ipin is 3 days past due today: its last day of grace is 4 days on
    for (const day of [-2, 4]) { // 1 and 7 days past due
      daysOn(day);
      const owner = await signIn(app, IPIN_OWNER);
      const view = SubscriptionView.parse((await http().get("/api/clinic/subscription").set("Cookie", owner.cookie)).body);
      expect(view, `day ${day}`).toMatchObject({ state: "overdue", payBy });
    }
    const desk = await signIn(app, NGITI_DESK, NGITI);
    expect((await http().get("/api/clinic/subscription").set("Cookie", desk.cookie)).status).toBe(403); // billing #31: other staff see none of it
    expect((await http().get("/api/clinic").set("Cookie", desk.cookie)).status).toBe(200);
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
    const change = await http().put(`/api/operator/accounts/${DEMO_CLINIC_ID}/tier`).set("Cookie", op).send({ tier: "big" });
    expect([change.status, change.text]).toEqual([409, "This subscription is cancelled, so its plan no longer changes."]);
    const staff = await inClinic(DEMO_CLINIC_ID, () => prisma.staff.count());
    daysOn(cancelled.daysUntilDue); // the paid month has run out
    await records.settleAll();
    const later = await asOperator(app);
    expect(SubscriptionView.parse((await http().get(`/api/operator/accounts/${DEMO_CLINIC_ID}/subscription`).set("Cookie", later)).body)).toMatchObject({ state: "ended", pausedFor: "cancelled" });
    expect(await account(DEMO_CLINIC_ID)).toMatchObject({ status: "suspended" });
    expect((await http().post(`/api/operator/accounts/${DEMO_CLINIC_ID}/reactivate`).set("Cookie", later)).status).toBe(409);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.staff.count())).toBe(staff); // billing #30: all data kept
  });

  it("refuses to reactivate a lapsed clinic until it pays", async () => {
    daysOn(5);
    await records.settleAll();
    const op = await asOperator(app);
    const res = await http().post(`/api/operator/accounts/${IPIN}/reactivate`).set("Cookie", op);
    expect([res.status, res.text]).toEqual([409, "This clinic's Primolar payment is past its grace period. Record the payment to reactivate it."]);
    const before = SubscriptionView.parse((await http().get(`/api/operator/accounts/${IPIN}/subscription`).set("Cookie", op)).body);
    const after = SubscriptionView.parse((await payByHand(IPIN)).body);
    expect(after).toMatchObject({ state: "paid", pausedFor: null });
    expect(after.payments[0]).toMatchObject({ periodStart: before.nextDue, amount: SEED_PRICES.plans.small.monthlyFee });
    expect(after.nextDue).toBe(after.payments[0]!.periodEnd); // the anchor's next date, not a month from the day paid
    expect(await account(IPIN)).toMatchObject({ status: "active" });
  });

  it("raises the next invoice at once on an upgrade", async () => {
    const op = await asOperator(app);
    const view = async () => SubscriptionView.parse((await http().get(`/api/operator/accounts/${NGITI}/subscription`).set("Cookie", op)).body);
    const before = await view(); // Ngiti: Small, paid up, due in 2 days
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "mid" })).body.account.tier).toBe("mid");
    const mid = SEED_PRICES.plans.mid.monthlyFee;
    expect(await view()).toMatchObject({ tier: "mid", downgrade: null, nextTier: "mid", nextAmount: mid });
    const paid = SubscriptionView.parse((await payByHand(NGITI)).body); // paid early: the schedule doesn't move
    expect(paid.payments[0]).toMatchObject({ tier: "mid", amount: mid, periodStart: before.nextDue });
  });

  it("makes a downgrade wait for the next due date, disabling nothing before it", async () => {
    const op = await asOperator(app);
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "mid" })).status).toBe(200);
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "small" })).body.account.tier).toBe("mid");
    const view = SubscriptionView.parse((await http().get(`/api/operator/accounts/${NGITI}/subscription`).set("Cookie", op)).body);
    expect(view).toMatchObject({ tier: "mid", downgrade: { tier: "small", on: view.nextDue }, nextAmount: SEED_PRICES.plans.small.monthlyFee });
    daysOn(view.daysUntilDue - 1);
    await records.settleAll();
    expect(await account(NGITI)).toMatchObject({ tier: "mid", status: "active" });
    daysOn(view.daysUntilDue);
    await records.settleAll();
    expect(await account(NGITI)).toMatchObject({ tier: "small" });
    const later = await asOperator(app);
    expect(SubscriptionView.parse((await http().get(`/api/operator/accounts/${NGITI}/subscription`).set("Cookie", later)).body)).toMatchObject({ tier: "small", downgrade: null });
  });

  it("bills an overdue month at the plan it began on when the clinic upgrades meanwhile (billing #27)", async () => {
    const op = await asOperator(app); // Ipin: Small, 3 days past due
    const fee = (t: "small" | "mid") => SEED_PRICES.plans[t].monthlyFee;
    expect((await http().put(`/api/operator/accounts/${IPIN}/tier`).set("Cookie", op).send({ tier: "mid" })).status).toBe(200);
    const view = SubscriptionView.parse((await http().get(`/api/operator/accounts/${IPIN}/subscription`).set("Cookie", op)).body);
    expect(view).toMatchObject({ tier: "mid", nextTier: "small", nextAmount: fee("small") });
    const after = SubscriptionView.parse((await payByHand(IPIN)).body);
    expect(after.payments[0]).toMatchObject({ tier: "small", amount: fee("small"), periodStart: view.nextDue });
    expect(after).toMatchObject({ nextTier: "mid", nextAmount: fee("mid") });
  });

  it("makes a downgrade asked for while overdue wait for the next due date, not the passed one", async () => {
    const fee = (t: "small" | "mid") => SEED_PRICES.plans[t].monthlyFee;
    const op = await asOperator(app);
    const view = async (cookie: string) => SubscriptionView.parse((await http().get(`/api/operator/accounts/${NGITI}/subscription`).set("Cookie", cookie)).body);
    const dueIn = (await view(op)).daysUntilDue; // Ngiti: Small, paid up, due in 2 days
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", op).send({ tier: "mid" })).status).toBe(200); // before its month begins: billed at Mid
    daysOn(dueIn + 2); // 2 days past due, within grace
    const late = await asOperator(app);
    expect((await http().put(`/api/operator/accounts/${NGITI}/tier`).set("Cookie", late).send({ tier: "small" })).status).toBe(200);
    const waiting = await view(late);
    expect(waiting).toMatchObject({ tier: "mid", nextTier: "mid", downgrade: { tier: "small" } });
    expect(waiting.downgrade!.on > waiting.nextDue).toBe(true); // not the passed due date
    const paid = SubscriptionView.parse((await payByHand(NGITI)).body);
    expect(paid.payments[0]).toMatchObject({ tier: "mid", amount: fee("mid"), periodStart: waiting.nextDue });
    expect(paid.nextDue).toBe(waiting.downgrade!.on);
    daysOn(dueIn + 2 + paid.daysUntilDue);
    await records.settleAll();
    expect(await view(await asOperator(app))).toMatchObject({ tier: "small", downgrade: null, nextTier: "small", nextAmount: fee("small") });
  });
});

describe("the first invoice (billing #29, chunk 23)", () => {
  it("dues a clinic approved on the 31st on the 30th next month, with its upfront payment as its first invoice", async () => {
    clock.set(new Date("2026-08-31T09:00:00+08:00"));
    const op = await asOperator(app);
    await http().post("/api/operator/signups/signup_hagikgik/payment").set("Cookie", op).send({ method: "bank_transfer", paidOn: "2026-08-30" });
    const counter = (await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "primolar" } })).next;
    const made = await http().post("/api/operator/signups/signup_hagikgik/approve").set("Cookie", op);
    expect(made.status).toBe(201);
    const view = SubscriptionView.parse((await http().get(`/api/operator/accounts/${made.body.overview.account.id}/subscription`).set("Cookie", op)).body);
    expect(view).toMatchObject({ tier: "mid", state: "paid", nextDue: "2026-09-30", payBy: "2026-10-07" });
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0]).toMatchObject({
      invoiceNo: `PRM-INV-${String(counter).padStart(5, "0")}`, amount: amountDue(SEED_PRICES, "mid", "designed").total, periodStart: "2026-08-31", periodEnd: "2026-09-30",
    });
    expect(view.payments[0]!.lines.map((l) => l.label)).toEqual(["Setup fee", "First month", "Design it for me"]);
  });
});
