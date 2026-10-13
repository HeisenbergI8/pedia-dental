import { describe, expect, it } from "vitest";
import { isTierUpgrade, primolarInvoiceNo, subscriptionDueOn, subscriptionReminder, subscriptionStatus } from "./subscription";

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
