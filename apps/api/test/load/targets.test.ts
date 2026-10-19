import { describe, expect, it } from "vitest";
import { outsideClinicHours } from "@pedia/shared";
import { TARGETS, bookingSlots, misses } from "./targets";

const ok = { requests: 1000, p97_5: 100, p99: 200, rps: 50, non2xx: 0, errors: 0 };
const hours = { opensAt: 9 * 60, closesAt: 17 * 60, closedWeekdays: [0] };

describe("load targets (B13c1 E10)", () => {
  it("covers Today, the patient list, search and booking", () => {
    expect(TARGETS.map((t) => t.path.split("?")[0])).toEqual(expect.arrayContaining(["/api/reports/today", "/api/patient-summaries", "/api/patients", "/api/appointments"]));
  });
  it("passes a run inside every threshold and fails each kind of miss", () => {
    const book = TARGETS.find((t) => t.method === "POST")!;
    expect(misses(book, ok)).toEqual([]);
    expect(misses(book, { ...ok, p97_5: 401 })).toHaveLength(1);
    expect(misses(book, { ...ok, non2xx: 1, errors: 1, rps: 5 })).toHaveLength(3);
    expect(misses(book, { ...ok, requests: 0 })).toContain("no requests completed");
  });
  it("books slots that never share a dentist or a chair at one time, all inside opening hours", () => {
    const gen = bookingSlots(hours, ["d1", "d2"], ["c1", "c2", "c3"], new Date("2027-03-06T16:00:00+08:00")); // a Saturday afternoon
    const slots = Array.from({ length: 60 }, () => gen.next().value!);
    const keys = slots.flatMap((s) => [`${s.dentistId}@${s.startsAt}`, `${s.chairId}@${s.startsAt}`]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(slots.filter((s) => outsideClinicHours(s.startsAt, 30, hours))).toEqual([]);
    expect(slots.some((s) => new Date(s.startsAt).getDay() === 0)).toBe(false); // Sunday closed
    expect(new Set(slots.map((s) => s.chairId))).toEqual(new Set(["c1", "c2"])); // pairs = min(dentists, chairs)
  });
});
