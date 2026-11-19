import { describe, expect, it } from "vitest";
import { SEED_PRICES } from "@pedia/seed";
import { TIER_LIMITS, TIER_SUPPORT, Tier, formatPeso, formatStorage } from "@pedia/shared";
import { plansContent } from "./plans-content";

const content = plansContent(SEED_PRICES);
const row = (name: string) => content.table.find((r) => r.row === name)!.cells;

describe("the Plans page's content (D16, D18)", () => {
  it("reads every price from the price list, never typed in", () => {
    for (const card of content.cards) expect(card.price).toBe(formatPeso(SEED_PRICES.plans[card.tier].monthlyFee));
    const changed = plansContent({ ...SEED_PRICES, plans: { ...SEED_PRICES.plans, small: { setupFee: 1, monthlyFee: 2 } } });
    expect(changed.cards[0]!.price).toBe(formatPeso(2));
  });

  it("reads every limit from TIER_LIMITS and every support level from TIER_SUPPORT", () => {
    for (const t of Tier.options) {
      expect(row("Parent texts a month")[t]).toBe(TIER_LIMITS[t].textParts.toLocaleString("en-PH"));
      expect(row("Photos and X-rays")[t]).toBe(formatStorage(TIER_LIMITS[t].storageBytes));
      expect(row("Help when you need it")[t]).toBe(TIER_SUPPORT[t].label);
    }
  });

  it("marks Clinic most popular and keeps the decided order", () => {
    expect(content.cards.map((c) => [c.tier, c.popular])).toEqual([["small", false], ["mid", true], ["big", false]]);
    expect(Object.keys(content)).toEqual(["headline", "cards", "everyPlan", "table", "faq"]);
  });
});
