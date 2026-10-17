import { describe, expect, it } from "vitest";
import { financeBounds, manilaStartUtc, nextDay, toCollected } from "./finance-facts";

describe("finance facts' bounds and shaping (B8 E7)", () => {
  it("bounds SQL by Manila days, written as UTC", () => {
    expect(financeBounds("2026-10-03")).toEqual({
      collectedFrom: "2026-04-30 16:00:00", // 1 May in Manila: six months back is the earliest bucket
      collectedEnd: "2026-10-31 16:00:00", // to the end of October, the latest bucket
      monthFrom: "2026-09-30 16:00:00",
      unpaidFrom: "2026-09-02 16:00:00",
      end: "2026-10-03 16:00:00",
    });
    expect(manilaStartUtc("2027-01-01")).toBe("2026-12-31 16:00:00");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
  });

  it("turns DECIMAL strings and bigints into numbers", () => {
    expect(toCollected([{ day: "2026-10-03", method: "cash", amount: "120000" }, { day: "2026-10-03", method: "gcash", amount: 5n }]))
      .toEqual([{ day: "2026-10-03", method: "cash", amount: 120000 }, { day: "2026-10-03", method: "gcash", amount: 5 }]);
  });
});
