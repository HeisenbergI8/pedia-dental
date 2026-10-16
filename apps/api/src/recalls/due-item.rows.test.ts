import { seedPlatform } from "@pedia/seed";
import { DueItem } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { dueItemData, toDueItem, type DueRow } from "./due-item.rows";

const db = Object.values(seedPlatform().tenants);
const items = db.flatMap((t) => t.dueItems);

describe("due item rows", () => {
  it("stores every seeded due item so that toDueItem reads back the same one, without its visit", () => {
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      const back = toDueItem(dueItemData(i, "visit_x") as DueRow);
      expect(DueItem.parse(back)).toEqual(i);
      expect(back).not.toHaveProperty("visitId");
    }
  });

  it("adds the dentist only when given", () => {
    const row = dueItemData(items[0]!, "visit_x") as DueRow;
    expect(toDueItem(row)).not.toHaveProperty("dentistId");
    expect(toDueItem(row, "staff_reyes").dentistId).toBe("staff_reyes");
  });
});
