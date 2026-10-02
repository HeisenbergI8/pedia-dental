import { describe, expect, it } from "vitest";
import { formatAge } from "./age";

describe("formatAge", () => {
  it("shows years and months", () => {
    expect(formatAge("2020-07-02", new Date("2026-10-02"))).toBe("6 y 3 m");
  });
  it("shows months only for infants", () => {
    expect(formatAge("2026-03-02", new Date("2026-10-02"))).toBe("7 m");
  });
});
