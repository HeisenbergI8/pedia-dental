import { seedPlatform } from "@pedia/seed";
import type { Visit } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { toVisit, visitRow } from "./visit.rows";

const platform = seedPlatform();
const tenants = Object.entries(platform.tenants);
const sample = (over: Partial<Visit> = {}): Visit => ({
  id: "v1", clinicId: "clinic_a", patientId: "p1", dentistId: "staff_reyes", date: "2026-06-01", status: "in_progress",
  startedAt: "2026-06-01T01:30:00.000Z", ...over,
});

describe("visit rows", () => {
  it("stores every seeded visit so that toVisit reads back exactly the same visit", () => {
    let seen = 0;
    for (const [clinicId, db] of tenants) {
      for (const v of db.visits) {
        expect(toVisit({ ...visitRow(v), clinicId })).toEqual({ ...v, clinicId });
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("leaves completedAt and appointmentId absent when they are", () => {
    const v = toVisit({ ...visitRow(sample()), clinicId: "clinic_a" });
    expect(v).not.toHaveProperty("completedAt");
    expect(v).not.toHaveProperty("appointmentId");
  });

  it("keeps the calendar day as stored, not shifted by the time zone", () => {
    expect(toVisit({ ...visitRow(sample({ date: "2026-06-01" })), clinicId: "clinic_a" }).date).toBe("2026-06-01");
  });
});
