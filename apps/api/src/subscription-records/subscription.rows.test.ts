import { describe, expect, it } from "vitest";
import { subscriptionPatch, subscriptionRows, toSubscription, toSubscriptionPayment } from "./subscription.rows";
import type { Subscription } from "@pedia/shared";

const SUB: Subscription = {
  clinicId: "clinic_a", anchor: "2026-01-31", paidMonths: 2,
  downgrade: { tier: "small", on: "2026-03-31" }, priceTier: { tier: "big", until: "2026-03-31" }, pause: "overdue",
  payments: [
    {
      id: "p1", invoiceNo: "PRM-INV-00001", tier: "mid", periodStart: "2026-01-31", periodEnd: "2026-02-28", method: "gcash",
      paidOn: "2026-01-31", amount: 1_000_000, recordedAt: "2026-01-31T02:00:00.000Z",
      lines: [{ label: "Setup fee", amount: 500_000 }, { label: "First month", amount: 500_000 }],
    },
  ],
};

describe("subscription rows (B12 Step 6.1)", () => {
  it("round-trip a subscription with a downgrade, a kept price and a pause, dates as yyyy-MM-dd", () => {
    const { subscription, payments, lines } = subscriptionRows(SUB);
    const back = toSubscription(
      { ...subscription },
      payments.map((p) => toSubscriptionPayment(p, lines.filter((l) => l.paymentId === p.id).reverse())),
    );
    expect(back).toEqual(SUB);
  });

  it("turns a settle's patch into column changes; nothing to do is nothing", () => {
    expect(subscriptionPatch({})).toEqual({});
    expect(subscriptionPatch({ tier: "small", status: "active" })).toEqual({}); // the account's columns, not these
    expect(subscriptionPatch({ downgrade: null, pause: null, priceTier: null })).toEqual({
      downgradeTier: null, downgradeOn: null, pause: null, priceTier: null, priceTierUntil: null,
    });
    expect(subscriptionPatch({ priceTier: { tier: "mid", until: "2026-05-01" }, pause: "overdue" })).toEqual({
      pause: "overdue", priceTier: "mid", priceTierUntil: new Date("2026-05-01T00:00:00.000Z"),
    });
  });
});
