import { describe, expect, it } from "vitest";
import { failNoSoonerThan } from "./sign-in-timing";

describe("failNoSoonerThan (security review #20)", () => {
  it("holds a quick failure until the floor, and throws the same error", async () => {
    const started = performance.now();
    const refused = new Error("no match");
    await expect(failNoSoonerThan(60, async () => { throw refused; })).rejects.toBe(refused);
    expect(performance.now() - started).toBeGreaterThanOrEqual(55);
  });

  it("returns a success at once", async () => {
    const started = performance.now();
    expect(await failNoSoonerThan(500, async () => "session")).toBe("session");
    expect(performance.now() - started).toBeLessThan(100);
  });

  it("adds nothing to a failure that already took longer than the floor", async () => {
    const started = performance.now();
    await expect(failNoSoonerThan(10, () => new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 40)))).rejects.toThrow("slow");
    expect(performance.now() - started).toBeLessThan(150);
  });
});
