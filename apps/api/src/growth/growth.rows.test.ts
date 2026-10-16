import { seedPlatform } from "@pedia/seed";
import { habitTimeline, type GrowthRecord } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { growthRow, toGrowth } from "./growth.rows";

const growth = Object.values(seedPlatform().tenants).flatMap((t) => t.growth);
// The input row read back as a stored one: Prisma types JSON input and output differently.
const back = (g: GrowthRecord) => toGrowth({ ...growthRow(g), clinicId: g.clinicId } as Parameters<typeof toGrowth>[0]);

describe("growth rows", () => {
  it("stores every seeded record so that toGrowth reads back exactly the same record", () => {
    expect(growth.length).toBe(6);
    for (const g of growth) expect(back(g)).toEqual(g);
  });

  it("gives the same habit timeline, inferred stop included, as the seed's records", () => {
    for (const patientId of new Set(growth.map((g) => g.patientId))) {
      const own = growth.filter((g) => g.patientId === patientId);
      expect(habitTimeline(own.map(back))).toEqual(habitTimeline(own));
    }
    expect(growth.some((g) => g.habits.length === 0)).toBe(true); // the inferred-stop example is in the seed
  });

  it("leaves speech absent when it is", () => {
    const g: GrowthRecord = { id: "g", clinicId: "c", patientId: "p", visitId: "v", habits: [], recordedAt: "2026-06-01T01:30:00.000Z" };
    expect(back(g)).not.toHaveProperty("speech");
  });
});
