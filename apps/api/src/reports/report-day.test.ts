import { describe, expect, it } from "vitest";
import { dayRefusal } from "./reports.service";

describe("a report's ?today= (bot report #24)", () => {
  it("takes a real day from 2000 to the end of the sixth year ahead", () => {
    for (const day of ["2000-01-01", "2026-11-19", "2032-12-31"]) expect(dayRefusal(day, "2026-11-19")).toBeUndefined();
  });

  it("refuses a malformed or impossible day as before", () => {
    for (const day of ["2026-1-1", "2026-13-45", "2026-02-30", "nonsense"]) expect(dayRefusal(day, "2026-11-19")).toBe("today must be YYYY-MM-DD");
  });

  it("refuses far-off days, which the database can't window, with the range", () => {
    for (const day of ["0001-01-01", "1900-01-01", "1999-12-31", "2033-01-01", "9999-12-31"]) {
      expect(dayRefusal(day, "2026-11-19")).toBe("today must be a day from 2000-01-01 to 2032-12-31");
    }
  });
});
