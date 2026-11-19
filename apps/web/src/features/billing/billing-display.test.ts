import { afterEach, describe, expect, it } from "vitest";
import { pesos } from "@pedia/shared";
import { glancePeso } from "@/features/dashboard/components/charts";
import { receiptFor } from "@/features/payments/components/receipt-list";
import { AMOUNT_ABOVE_ZERO, typedCentavos } from "./api";
import { manilaDate, manilaDateTime, manilaDay, manilaTime } from "./manila-time";

describe("a typed money amount (bot report #15)", () => {
  it("takes an amount above zero in centavos", () => {
    expect(typedCentavos("500")).toBe(pesos(500));
    expect(typedCentavos("0.5")).toBe(50);
  });

  it("refuses a minus, zero or nothing instead of dropping the sign", () => {
    for (const text of ["-500", "0", "", "abc", "0.001"]) expect(typedCentavos(text)).toBeUndefined();
    expect(AMOUNT_ABOVE_ZERO).toBe("Enter an amount above ₱0");
  });
});

describe("Manila time on a device set to another zone (bot report #27)", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    process.env.TZ = zone;
  });

  it("gives the Manila day and clock in Honolulu", () => {
    process.env.TZ = "Pacific/Honolulu";
    const at = "2026-11-19T08:35:00.000Z"; // 4:35 PM in Manila, 10:35 PM the day before in Honolulu
    expect(manilaDay(at)).toBe("2026-11-19");
    expect(manilaTime(at)).toBe("4:35 PM");
    expect(manilaDate(at)).toBe("Nov 19, 2026");
    expect(manilaDateTime(at)).toBe("Nov 19, 2026 4:35 PM");
  });

  it("turns over at Manila midnight, not UTC's", () => {
    expect(manilaDay("2026-11-18T15:59:00.000Z")).toBe("2026-11-18");
    expect(manilaDay("2026-11-18T16:00:00.000Z")).toBe("2026-11-19");
  });
});

describe("what a sent receipt paid for (bot report #18)", () => {
  const receipt = { periodStart: null, packs: null, parts: null };
  it("names a text top-up by its packs and texts", () => {
    expect(receiptFor({ ...receipt, packs: 4, parts: 1000 })).toBe("Text top-up, 4 packs (1,000 texts)");
    expect(receiptFor({ ...receipt, packs: 1, parts: 250 })).toBe("Text top-up, 1 pack (250 texts)");
  });

  it("keeps a month's and a sign-up's wording", () => {
    expect(receiptFor({ ...receipt, periodStart: "2026-11-01" })).toBe("Month from 1 November 2026");
    expect(receiptFor(receipt)).toBe("Setup fee and first month");
  });
});

describe("a peso figure read at a glance (bot report #34)", () => {
  it("is in full below ₱1,000,000 and compact from there", () => {
    expect(glancePeso(pesos(999_999.99))).toBe("₱999,999.99");
    expect(glancePeso(2_147_964_898)).toBe("₱21.5M");
    expect(glancePeso(-pesos(1_200_000))).toBe("-₱1.2M");
  });
});
