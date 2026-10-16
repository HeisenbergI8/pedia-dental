import { addMinutes, format, setHours, startOfDay } from "date-fns";
import { DEFAULT_OPENING_HOURS, outsideClinicHours } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { CLINIC_TIME_ZONE } from "./clinic-time";

describe("clinic time (E3)", () => {
  it("runs the process in Manila time", () => {
    expect(process.env.TZ).toBe(CLINIC_TIME_ZONE);
    expect(new Date("2030-01-07T01:00:00.000Z").getHours()).toBe(9); // 01:00Z is 9:00 in Manila
    expect(format(new Date("2030-01-06T16:30:00.000Z"), "yyyy-MM-dd")).toBe("2030-01-07"); // after Manila midnight
  });

  it("takes a 9:00 Manila booking and refuses 7:15 (the mock's case)", () => {
    expect(outsideClinicHours("2030-01-07T01:00:00.000Z", 30, DEFAULT_OPENING_HOURS)).toBeUndefined();
    expect(outsideClinicHours("2030-01-14T23:15:00.000Z", 30, DEFAULT_OPENING_HOURS)).toBe("Book between 8:00 AM and 6:00 PM.");
  });

  it("puts the seed's setHours on Manila's clock", () => {
    const nine = setHours(startOfDay(new Date("2030-01-07T04:00:00.000Z")), 9);
    expect(nine.toISOString()).toBe("2030-01-07T01:00:00.000Z");
    expect(addMinutes(nine, 0).getTimezoneOffset()).toBe(-480);
  });
});
