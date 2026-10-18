import { describe, expect, it } from "vitest";
import type { PriceList } from "../schemas/signup";
import { downgradeProblem, isTierUpgrade, limitTier, priceOn, primolarInvoiceNo, settleStep, subscriptionDueOn, subscriptionReminder, subscriptionStatus } from "./subscription";

describe("subscriptionDueOn (billing #26)", () => {
  it("falls on the last day of a shorter month for an approval on the 31st, then returns to the 31st", () => {
    expect(subscriptionDueOn("2026-08-31", 1)).toBe("2026-09-30");
    expect(subscriptionDueOn("2026-08-31", 2)).toBe("2026-10-31");
    expect(subscriptionDueOn("2027-01-31", 1)).toBe("2027-02-28");
    expect(subscriptionDueOn("2027-12-29", 2)).toBe("2028-02-29"); // a leap year keeps the 29th
  });

  it("keeps an ordinary day of the month", () => expect(subscriptionDueOn("2026-03-15", 7)).toBe("2026-10-15"));
});

describe("subscriptionStatus (billing #28–#30, S4)", () => {
  const sub = { anchor: "2026-08-31", paidMonths: 1 }; // next due 2026-09-30
  const at = (today: string) => subscriptionStatus(sub, today);

  it("is paid until three days before the due date", () => expect(at("2026-09-26").state).toBe("paid"));

  it("is due soon from three days before to the day itself", () => {
    expect(at("2026-09-27")).toMatchObject({ state: "due_soon", daysUntilDue: 3 });
    expect(at("2026-09-30")).toMatchObject({ state: "due_soon", daysUntilDue: 0 });
  });

  it("gives seven days' grace with the pay-by date, then lapses", () => {
    expect(at("2026-10-01")).toMatchObject({ state: "overdue", payBy: "2026-10-07", daysUntilDue: -1 });
    expect(at("2026-10-07").state).toBe("overdue");
    expect(at("2026-10-08").state).toBe("lapsed");
  });

  it("keeps the original schedule after a late payment", () => {
    expect(subscriptionStatus({ ...sub, paidMonths: 2 }, "2026-10-05")).toMatchObject({ state: "paid", nextDue: "2026-10-31" });
  });

  it("ends a cancelled subscription when the paid month ends, with no grace", () => {
    const cancelled = { ...sub, cancelledAt: "2026-09-10T09:00:00.000+08:00" };
    expect(subscriptionStatus(cancelled, "2026-09-29").state).toBe("ending");
    expect(subscriptionStatus(cancelled, "2026-09-30").state).toBe("ended");
  });
});

describe("subscriptionReminder (billing #32)", () => {
  const sub = { anchor: "2026-08-31", paidMonths: 1 };
  const remind = (today: string) => subscriptionReminder(subscriptionStatus(sub, today));

  it("says due in 3 days, due today, and overdue with the date to pay by", () => {
    expect(remind("2026-09-27")).toBe("Your Primolar payment is due in 3 days, on 30 September 2026.");
    expect(remind("2026-09-29")).toBe("Your Primolar payment is due in 1 day, on 30 September 2026.");
    expect(remind("2026-09-30")).toBe("Your Primolar payment is due today.");
    expect(remind("2026-10-02")).toBe("Your Primolar payment is overdue. Pay by 7 October 2026 to keep your clinic running.");
  });

  it("says nothing when paid up, or once paused (the pause speaks for itself)", () => {
    expect(remind("2026-09-01")).toBeUndefined();
    expect(remind("2026-10-08")).toBeUndefined();
  });
});

describe("invoice numbers and plan order", () => {
  it("numbers invoices PRM-INV-00001 upward", () => expect(primolarInvoiceNo(42)).toBe("PRM-INV-00042"));

  it("orders the plans Small < Mid < Big", () => {
    expect(isTierUpgrade("small", "mid")).toBe(true);
    expect(isTierUpgrade("big", "mid")).toBe(false);
    expect(isTierUpgrade("mid", "mid")).toBe(false);
  });
});

const list = (small: number): PriceList => ({ plans: { small: { setupFee: 0, monthlyFee: small }, mid: { setupFee: 0, monthlyFee: 2 }, big: { setupFee: 0, monthlyFee: 3 } }, designAddOn: 0 });

describe("prices by the month's start (B12 decision 11)", () => {
  it("bills a month that began before a change at the old list, and from the change's day at the new one", () => {
    const changes = [{ on: "2026-10-18", before: list(100) }];
    expect(priceOn(changes, list(200), "2026-10-17").plans.small.monthlyFee).toBe(100);
    expect(priceOn(changes, list(200), "2026-10-18").plans.small.monthlyFee).toBe(200);
  });
  it("keeps the list in force when the day began, for two changes on one day", () => {
    const changes = [{ on: "2026-10-18", before: list(100) }, { on: "2026-10-18", before: list(150) }];
    expect(priceOn(changes, list(200), "2026-10-17").plans.small.monthlyFee).toBe(100);
  });
});

describe("settleStep (S2, B12 E5)", () => {
  const active = { tier: "mid" as const, status: "active" as const };
  const sub = { anchor: "2026-01-10", paidMonths: 10 }; // due 2026-11-10
  it("changes nothing for a paid-up clinic", () => {
    expect(settleStep(sub, active, "2026-10-18")).toEqual({});
  });
  it("applies a downgrade whose date came, keeping the old price for a month that began before it", () => {
    const due = { anchor: "2026-01-10", paidMonths: 9, downgrade: { tier: "small" as const, on: "2026-10-12" } }; // unpaid from 10 Oct
    expect(settleStep(due, active, "2026-10-12")).toEqual({ tier: "small", downgrade: null, priceTier: { tier: "mid", until: "2026-10-12" } });
  });
  it("pauses a lapsed clinic for non-payment, leaves a manual pause alone, and lifts its own pause once back in grace", () => {
    const lapsed = { anchor: "2026-01-10", paidMonths: 9 }; // due 10 Oct, grace to 17 Oct
    expect(settleStep(lapsed, active, "2026-10-18")).toEqual({ status: "suspended", pause: "overdue" });
    expect(settleStep(sub, { tier: "mid", status: "suspended" }, "2026-10-18")).toEqual({});
    expect(settleStep({ ...sub, pause: "overdue" }, { tier: "mid", status: "suspended" }, "2026-10-18")).toEqual({ status: "active", pause: null });
  });
});

describe("downgrades (B12 decision 12, E13)", () => {
  it("refuses one while the clinic is over the smaller plan, naming what to remove", () => {
    expect(downgradeProblem("small", { branches: 2, staffLogins: 5 })).toContain("2 open branches and 5 staff logins. The Small plan includes 1 branch and 5 staff logins");
    expect(downgradeProblem("small", { branches: 1, staffLogins: 5 })).toBeUndefined();
  });
  it("checks additions against the smaller plan while a downgrade waits", () => {
    expect([limitTier("mid", { tier: "small" }), limitTier("mid"), limitTier("small", { tier: "big" })]).toEqual(["small", "mid", "small"]);
  });
});
