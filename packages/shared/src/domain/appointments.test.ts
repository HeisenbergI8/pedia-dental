import { describe, expect, it } from "vitest";
import { canTransition, findConflict } from "./appointments";

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
