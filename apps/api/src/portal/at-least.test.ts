import { afterEach, describe, expect, it, vi } from "vitest";
import { atLeast } from "./at-least";

afterEach(() => vi.useRealTimers());

describe("atLeast (audit #20: a reset answers in the same time for known and unknown numbers)", () => {
  it("waits out the rest of the time after quick work, and returns its answer", async () => {
    vi.useFakeTimers();
    let t = 0;
    let done = false;
    const answer = atLeast(750, async () => {
      t += 10; // the unknown number's quick path
      return "ok";
    }, () => t).then((v) => ((done = true), v));
    await vi.advanceTimersByTimeAsync(739);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await answer).toBe("ok");
  });

  it("adds nothing when the work already took longer", async () => {
    let t = 0;
    const started = Date.now();
    expect(await atLeast(750, async () => ((t += 900), 1), () => t)).toBe(1);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it("pads a failure too, then passes the error on", async () => {
    vi.useFakeTimers();
    let t = 0;
    let settled = false;
    const failing = atLeast(500, async () => {
      throw new Error("boom");
    }, () => t).catch((e: Error) => ((settled = true), e.message));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await failing).toBe("boom");
  });
});
