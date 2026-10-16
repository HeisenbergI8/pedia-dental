import { describe, expect, it } from "vitest";
import { createTestApp } from "../../test/support/test-app";
import { Clock, FixedClock, SystemClock, manilaDate } from "./clock";

describe("Clock", () => {
  it("reads the date in Manila, not UTC", () => {
    expect(manilaDate(new Date("2026-10-15T15:59:59Z"))).toBe("2026-10-15");
    expect(manilaDate(new Date("2026-10-15T16:00:00Z"))).toBe("2026-10-16"); // midnight in Manila
  });

  it("a fixed clock moves only when set", () => {
    const clock = new FixedClock(new Date("2026-03-01T00:30:00Z"));
    expect(clock.today()).toBe("2026-03-01");
    clock.set(new Date("2026-03-31T17:00:00Z"));
    expect(clock.today()).toBe("2026-04-01");
  });

  it("is provided app-wide as the system clock", async () => {
    const app = await createTestApp();
    expect(app.get(Clock)).toBeInstanceOf(SystemClock);
    await app.close();
  });
});
