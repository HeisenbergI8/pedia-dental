import { describe, expect, it } from "vitest";
import { IsoDate } from "./common";

describe("IsoDate", () => {
  it("takes a real day of the calendar and nothing else", () => {
    for (const ok of ["2026-10-02", "2024-02-29", "1900-01-01"]) expect(IsoDate.safeParse(ok).success).toBe(true);
    for (const bad of ["2026-13-45", "2026-02-30", "2025-02-29", "0000-00-00", "2026-1-1", "20261002"]) expect(IsoDate.safeParse(bad).success).toBe(false);
  });
});
