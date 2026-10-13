import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { AccountOverview, ClinicContext, CreateAccountResult, Session, SubscriptionView } from "@pedia/shared";
import { ApiError, api } from "@/lib/api-client";
import { setToday } from "./clock";
import { accountById, platform } from "./db";
import { DEMO_PASSWORD } from "./demo-accounts";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const OPERATOR = "operator.operator_primolar";
const IPIN_OWNER = "demo.clinic_ipin.ipin_staff_santiago";
const BULILIT_ADMIN = "demo.clinic_demo.staff_delacruz";
const cookies = (...c: string[]) => vi.stubGlobal("document", { cookie: c.join("; ") });
const asOperator = () => cookies(`pd_operator=${OPERATOR}`);
const asStaff = (token: string) => cookies(`pd_session=${token}`);
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const subscription = (id: string) => api(`/operator/accounts/${id}/subscription`, SubscriptionView);
const pay = (id: string, paidOn: string) =>
  api(`/operator/accounts/${id}/subscription/payments`, SubscriptionView, send("POST", { method: "gcash", paidOn }));
const setTier = (id: string, tier: string) => api(`/operator/accounts/${id}/tier`, AccountOverview, send("PUT", { tier }));
const ipin = () => platform.subscriptions.find((s) => s.clinicId === "clinic_ipin")!;

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  Object.assign(ipin(), { anchor: "2026-08-31", paidMonths: 1 }); // due 2026-09-30 and not paid
});
afterAll(() => {
  setToday(null);
  server.close();
  vi.unstubAllGlobals();
});

describe("subscriptions (chunk 23 done-when)", () => {
  it("dues a clinic approved on the 31st on the 30th next month, with its upfront payment as its first invoice", async () => {
    setToday("2026-08-31");
    asOperator();
    await api("/operator/signups/signup_hagikgik/payment", z.unknown(), send("POST", { method: "bank_transfer", paidOn: "2026-08-30" }));
    const made = await api("/operator/signups/signup_hagikgik/approve", CreateAccountResult, send("POST"));
    const view = await subscription(made.overview.account.id);
    expect(view).toMatchObject({ tier: "mid", state: "paid", nextDue: "2026-09-30", payBy: "2026-10-07" });
    const quote = platform.signups.find((s) => s.id === "signup_hagikgik")!.quote;
    expect(view.payments).toHaveLength(1);
    expect(view.payments[0]).toMatchObject({ invoiceNo: "PRM-INV-00015", amount: quote.total, periodStart: "2026-08-31", periodEnd: "2026-09-30" });
    expect(view.payments[0]!.lines.map((l) => l.label)).toEqual(["Setup fee", "First month", "Design it for me"]);
  });

  it("shows only the Owner the overdue state, with the date to pay by, for seven days", async () => {
    for (const day of ["2026-10-01", "2026-10-07"]) {
      setToday(day);
      asStaff(IPIN_OWNER);
      expect(await api("/clinic/subscription", SubscriptionView)).toMatchObject({ state: "overdue", payBy: "2026-10-07" });
    }
    asStaff(BULILIT_ADMIN);
    expect(await status(api("/clinic/subscription", SubscriptionView))).toBe(403); // billing #31: other staff see none of it
    expect(await status(api("/clinic", ClinicContext))).toBe(200);
  });

  it("then pauses the clinic with the existing pause: staff out at once and at sign-in", async () => {
    setToday("2026-10-08");
    asStaff(IPIN_OWNER);
    expect(await status(api("/clinic", ClinicContext))).toBe(401); // platform #41: the very next request
    expect(accountById("clinic_ipin")!.status).toBe("suspended");
    expect(ipin().pause).toBe("overdue");
    cookies();
    expect(await status(api("/auth/login", Session, send("POST", { email: "owner@ipin.demo", password: DEMO_PASSWORD })))).toBe(403);
  });

  it("refuses Reactivate while lapsed; recording the payment reactivates at once and keeps the due date", async () => {
    setToday("2026-10-10");
    asOperator();
    expect(await status(api("/operator/accounts/clinic_ipin/reactivate", AccountOverview, send("POST")))).toBe(409);
    const after = await pay("clinic_ipin", "2026-10-10");
    expect(after).toMatchObject({ state: "paid", nextDue: "2026-10-31", pausedFor: null }); // the 31st again, not the 10th
    expect(after.payments[0]).toMatchObject({ periodStart: "2026-09-30", periodEnd: "2026-10-31", amount: platform.prices.plans.small.monthlyFee });
    asStaff(IPIN_OWNER);
    expect(await status(api("/clinic", ClinicContext))).toBe(200);
  });

  it("never lifts a pause the operator made by hand", async () => {
    asOperator();
    await api("/operator/accounts/clinic_ngiti/suspend", AccountOverview, send("POST"));
    await pay("clinic_ngiti", "2026-10-10");
    expect(accountById("clinic_ngiti")!.status).toBe("suspended");
    await api("/operator/accounts/clinic_ngiti/reactivate", AccountOverview, send("POST")); // allowed: not lapsed
    expect(accountById("clinic_ngiti")!.status).toBe("active");
  });

  it("raises the next invoice at once on an upgrade", async () => {
    setToday("2026-10-12");
    asOperator();
    expect((await setTier("clinic_ipin", "mid")).account.tier).toBe("mid");
    const mid = platform.prices.plans.mid.monthlyFee;
    expect(await subscription("clinic_ipin")).toMatchObject({ tier: "mid", downgrade: null, nextAmount: mid });
    const paid = await pay("clinic_ipin", "2026-10-12"); // paid early: the schedule doesn't move
    expect(paid.payments[0]).toMatchObject({ tier: "mid", amount: mid, periodStart: "2026-10-31", periodEnd: "2026-11-30" });
  });

  it("makes a downgrade wait for the next due date, disabling nothing before it", async () => {
    asOperator();
    expect((await setTier("clinic_ipin", "small")).account.tier).toBe("mid");
    expect(await subscription("clinic_ipin")).toMatchObject({
      tier: "mid",
      downgrade: { tier: "small", on: "2026-11-30" },
      nextAmount: platform.prices.plans.small.monthlyFee,
    });
    setToday("2026-11-29");
    expect((await subscription("clinic_ipin")).tier).toBe("mid");
    setToday("2026-11-30");
    expect(await subscription("clinic_ipin")).toMatchObject({ tier: "small", downgrade: null, state: "due_soon" });
  });

  it("cancels at the end of the paid month: no more payments, then the pause, with all data kept", async () => {
    setToday("2026-11-30");
    asOperator();
    await pay("clinic_ipin", "2026-11-30"); // through 2026-12-31 (the anchor is the 31st)
    setToday("2026-12-20");
    const staff = platform.tenants.clinic_ipin!.staff.length;
    expect(await api("/operator/accounts/clinic_ipin/subscription/cancel", SubscriptionView, send("POST"))).toMatchObject({ state: "ending", nextDue: "2026-12-31" });
    expect(await status(pay("clinic_ipin", "2026-12-20"))).toBe(409);
    setToday("2026-12-31");
    expect(await subscription("clinic_ipin")).toMatchObject({ state: "ended", pausedFor: "cancelled" });
    expect(accountById("clinic_ipin")!.status).toBe("suspended");
    expect(await status(api("/operator/accounts/clinic_ipin/reactivate", AccountOverview, send("POST")))).toBe(409);
    expect(platform.tenants.clinic_ipin!.staff).toHaveLength(staff); // billing #30: all data kept
  });
});

describe("plan changes and pauses around a running month (review fixes)", () => {
  const ngiti = () => platform.subscriptions.find((s) => s.clinicId === "clinic_ngiti")!;
  const fee = (tier: "small" | "mid") => platform.prices.plans[tier].monthlyFee;
  /** Ngiti, active on `tier`, due 2026-10-15 and not yet paid for that month. */
  function reset(tier: "small" | "mid") {
    const sub = ngiti();
    Object.assign(sub, { anchor: "2026-01-15", paidMonths: 9 });
    for (const k of ["downgrade", "priceTier", "cancelledAt", "pause"] as const) delete sub[k];
    Object.assign(accountById("clinic_ngiti")!, { tier, status: "active" });
  }

  it("bills an overdue month at the plan it began on when the clinic upgrades meanwhile (billing #27)", async () => {
    reset("small");
    setToday("2026-10-18");
    asOperator();
    await setTier("clinic_ngiti", "mid");
    expect(await subscription("clinic_ngiti")).toMatchObject({ tier: "mid", nextTier: "small", nextAmount: fee("small") });
    const after = await pay("clinic_ngiti", "2026-10-18");
    expect(after.payments[0]).toMatchObject({ tier: "small", amount: fee("small"), periodStart: "2026-10-15" });
    expect(after).toMatchObject({ nextTier: "mid", nextAmount: fee("mid"), nextDue: "2026-11-15" });
  });

  it("makes a downgrade asked for while overdue wait for the next due date, not the passed one", async () => {
    reset("mid");
    setToday("2026-10-18");
    asOperator();
    await setTier("clinic_ngiti", "small");
    expect(await subscription("clinic_ngiti")).toMatchObject({ tier: "mid", downgrade: { tier: "small", on: "2026-11-15" }, nextTier: "mid" });
    expect((await pay("clinic_ngiti", "2026-10-18")).payments[0]).toMatchObject({ tier: "mid", amount: fee("mid") });
    setToday("2026-11-15");
    expect(await subscription("clinic_ngiti")).toMatchObject({ tier: "small", downgrade: null, nextTier: "small", nextAmount: fee("small") });
  });

  it("lifts its own pause when the demo clock moves back, and refuses plan changes once cancelled", async () => {
    reset("small");
    setToday("2026-10-23"); // grace ended on 2026-10-22
    asOperator();
    expect(await subscription("clinic_ngiti")).toMatchObject({ state: "lapsed", pausedFor: "overdue" });
    setToday("2026-10-16");
    expect(await subscription("clinic_ngiti")).toMatchObject({ state: "overdue", pausedFor: null });
    expect(accountById("clinic_ngiti")!.status).toBe("active");
    await api("/operator/accounts/clinic_ngiti/subscription/cancel", SubscriptionView, send("POST"));
    expect(await status(setTier("clinic_ngiti", "mid"))).toBe(409);
  });
});
