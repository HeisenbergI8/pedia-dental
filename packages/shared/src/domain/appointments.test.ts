import { describe, expect, it } from "vitest";
import { bookableStart, canTransition, countByDay, findConflict, findFreeSlot, findFreeSlots, isClosedDay, nextOpenStart, outsideClinicHours } from "./appointments";

const at = (time: string, extra: Partial<Parameters<typeof findConflict>[0]> = {}) => ({
  id: time,
  dentistId: "d1",
  chairId: "c1",
  startsAt: `2026-10-05T${time}:00Z`,
  durationMin: 30,
  status: "booked" as const,
  ...extra,
});

describe("appointment status flow", () => {
  it("follows booked → confirmed → arrived → in chair → done", () => {
    expect(canTransition("booked", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "arrived")).toBe(true);
    expect(canTransition("arrived", "in_chair")).toBe(true);
    expect(canTransition("in_chair", "done")).toBe(true);
  });

  it("allows no-show only before arrival, and nothing after a final status", () => {
    expect(canTransition("confirmed", "no_show")).toBe(true);
    expect(canTransition("arrived", "no_show")).toBe(false);
    expect(canTransition("done", "cancelled")).toBe(false);
    expect(canTransition("no_show", "arrived")).toBe(false);
  });
});

describe("double-booking", () => {
  it("flags an overlap on the same chair or the same dentist", () => {
    expect(findConflict(at("09:15", { id: "new" }), [at("09:00")])?.on).toBe("chair");
    expect(findConflict(at("09:15", { id: "new", chairId: "c2" }), [at("09:00")])?.on).toBe("dentist");
  });

  it("allows back-to-back slots, other chairs and dentists, and freed slots", () => {
    expect(findConflict(at("09:30", { id: "new" }), [at("09:00")])).toBeUndefined();
    expect(findConflict(at("09:00", { id: "new", chairId: "c2", dentistId: "d2" }), [at("09:00")])).toBeUndefined();
    expect(findConflict(at("09:00", { id: "new" }), [at("09:00", { status: "cancelled" })])).toBeUndefined();
  });

  it("ignores the appointment being moved", () => {
    expect(findConflict(at("09:15", { id: "09:00" }), [at("09:00")])).toBeUndefined();
  });
});

describe("calendar days", () => {
  const sunday = new Date(2026, 9, 4); // Oct 4, 2026 is a Sunday
  it("shows a Sunday as closed only when nothing is booked", () => {
    expect(isClosedDay(sunday, 0)).toBe(true);
    expect(isClosedDay(sunday, 1)).toBe(false);
    expect(isClosedDay(new Date(2026, 9, 5), 0)).toBe(false);
  });
  it("counts live appointments per local day", () => {
    const at = (h: number, status: "booked" | "cancelled" = "booked") => ({ startsAt: new Date(2026, 9, 5, h).toISOString(), status });
    expect(countByDay([at(9), at(10), at(11, "cancelled")]).get("2026-10-05")).toBe(2);
  });
});

describe("outsideClinicHours", () => {
  it("accepts a booking inside opening hours, including one ending at closing", () => {
    expect(outsideClinicHours(new Date(2026, 9, 5, 8, 0), 30)).toBeUndefined();
    expect(outsideClinicHours(new Date(2026, 9, 5, 17, 30), 30)).toBeUndefined();
  });
  it("refuses a start before opening or an end after closing", () => {
    expect(outsideClinicHours(new Date(2026, 9, 5, 7, 15), 30)).toMatch(/between 8:00 AM and 6:00 PM/);
    expect(outsideClinicHours(new Date(2026, 9, 5, 17, 45), 30)).toMatch(/between/);
  });
  it("refuses a closed weekday", () => {
    expect(outsideClinicHours(new Date(2026, 9, 11, 9, 0), 30)).toMatch(/closed on Sundays/);
  });
});

describe("nextOpenStart", () => {
  it("keeps an open slot, rounding up to the quarter hour", () => {
    expect(nextOpenStart(new Date(2026, 9, 5, 9, 5))).toEqual(new Date(2026, 9, 5, 9, 15));
  });
  it("moves a Sunday due date to Monday's opening", () => {
    expect(nextOpenStart(new Date(2026, 9, 11, 9, 0))).toEqual(new Date(2026, 9, 12, 8, 0));
  });
  it("moves an evening to the next open morning, skipping Sunday", () => {
    expect(nextOpenStart(new Date(2026, 9, 10, 17, 50), 30)).toEqual(new Date(2026, 9, 12, 8, 0)); // Sat evening → Mon
  });
  it("moves an early start to opening", () => {
    expect(nextOpenStart(new Date(2026, 9, 5, 6, 0))).toEqual(new Date(2026, 9, 5, 8, 0));
  });
});

describe("findFreeSlot", () => {
  const busy = (id: string, chairId: string, dentistId: string, at: Date, durationMin = 60) =>
    ({ id, chairId, dentistId, startsAt: at.toISOString(), durationMin, status: "booked" as const });
  const ask = { from: new Date(2026, 9, 5, 8, 0), durationMin: 30, dentistId: "d1", chairIds: ["c1", "c2"] };
  it("takes the opening and the first chair on an empty day", () => {
    expect(findFreeSlot(ask, [])).toEqual({ startsAt: new Date(2026, 9, 5, 8, 0), chairId: "c1" });
  });
  it("moves to the next chair when the first is taken", () => {
    expect(findFreeSlot(ask, [busy("a", "c1", "d2", new Date(2026, 9, 5, 8, 0))])).toEqual({ startsAt: new Date(2026, 9, 5, 8, 0), chairId: "c2" });
  });
  it("waits for the dentist, whichever chair they are in", () => {
    expect(findFreeSlot(ask, [busy("a", "c2", "d1", new Date(2026, 9, 5, 8, 0))])?.startsAt).toEqual(new Date(2026, 9, 5, 9, 0));
  });
  it("starts a Sunday request on Monday, and is undefined when the window is full", () => {
    expect(findFreeSlot({ ...ask, from: new Date(2026, 9, 11, 9, 0) }, [])?.startsAt).toEqual(new Date(2026, 9, 12, 8, 0));
    expect(findFreeSlot({ ...ask, days: 1 }, [busy("a", "c1", "d1", new Date(2026, 9, 5, 8, 0), 600)])).toBeUndefined();
  });
});

describe("bookableStart", () => {
  const now = new Date(2026, 9, 5, 10, 5); // Monday 10:05
  it("turns a calendar day at midnight into that day's opening", () => {
    expect(bookableStart(new Date(2026, 9, 7), now)).toEqual(new Date(2026, 9, 7, 8, 0));
  });
  it("never opens in the past: a past day or no start means the next open slot from now", () => {
    expect(bookableStart(new Date(2026, 9, 1), now)).toEqual(new Date(2026, 9, 5, 10, 15));
    expect(bookableStart(undefined, now)).toEqual(new Date(2026, 9, 5, 10, 15));
  });
  it("keeps a clicked open slot as it is", () => {
    expect(bookableStart(new Date(2026, 9, 6, 14, 30), now)).toEqual(new Date(2026, 9, 6, 14, 30));
  });
});

describe("findFreeSlots", () => {
  const monday9 = new Date(2026, 9, 5, 9, 0);
  const booked = (h: number, m: number, chairId: string, dentistId = "d1") =>
    ({ id: `${h}:${m}${chairId}`, dentistId, chairId, startsAt: new Date(2026, 9, 5, h, m).toISOString(), durationMin: 30, status: "booked" as const });

  it("returns the next N distinct open times, skipping a busy dentist", () => {
    const slots = findFreeSlots({ from: monday9, durationMin: 30, dentistId: "d1", chairIds: ["c1", "c2"] }, [booked(9, 0, "c1")], 3);
    expect(slots.map((s) => s.startsAt.getHours() * 60 + s.startsAt.getMinutes())).toEqual([9 * 60 + 30, 9 * 60 + 45, 10 * 60]);
  });
  it("uses the next chair when the first is taken by another dentist", () => {
    const [first] = findFreeSlots({ from: monday9, durationMin: 30, dentistId: "d1", chairIds: ["c1", "c2"] }, [booked(9, 0, "c1", "d2")], 1);
    expect(first).toEqual({ startsAt: monday9, chairId: "c2" });
  });
});
