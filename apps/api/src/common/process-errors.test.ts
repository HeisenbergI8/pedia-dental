import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { errorFingerprint, installProcessHandlers } from "./process-errors";

const withStack = (name: string, frames: string[]) => Object.assign(new Error("x"), { name, stack: [`${name}: x`, ...frames.map((f) => `    at ${f}`)].join("\n") });

describe("error fingerprints and the process handlers (B13a Step 4.2)", () => {
  it("is stable for the same kind of error, whatever its message or line numbers", () => {
    const thrower = (message: string) => {
      try {
        throw new Error(message);
      } catch (error) {
        return error;
      }
    };
    expect(errorFingerprint(thrower("a"))).toBe(errorFingerprint(thrower("b")));
    expect(errorFingerprint(Object.assign(thrower("a") as Error, { name: "TypeError" }))).not.toBe(errorFingerprint(thrower("a")));
    const at = (line: number) => withStack("Error", [`Service.run (/app/dist/main.mjs:${line}:7)`, `async Handler.go (/app/dist/main.mjs:${line + 9}:3)`]);
    expect(errorFingerprint(at(10))).toBe(errorFingerprint(at(4000)));
    expect(errorFingerprint(at(10))).toMatch(/^[0-9a-f]{12}$/);
  });

  it("logs, counts and exits on an uncaught exception or an unhandled rejection, never quoting a Prisma message", () => {
    for (const [event, message] of [["uncaughtException", "Uncaught exception"], ["unhandledRejection", "Unhandled promise rejection"]] as const) {
      const fatal = vi.fn();
      const count = vi.fn();
      const exit = vi.fn();
      const target = new EventEmitter();
      installProcessHandlers(fatal, count, target, exit);
      const error = Object.assign(withStack("PrismaClientKnownRequestError", ["Prisma.run (x.js:1:1)"]), { message: "Unique constraint on Bea Mendoza", code: "P2002" });
      target.emit(event, error);
      expect([count.mock.calls.length, exit.mock.calls]).toEqual([1, [[1]]]);
      expect(fatal).toHaveBeenCalledWith(expect.objectContaining({ fingerprint: expect.stringMatching(/^[0-9a-f]{12}$/) }), message);
      expect(JSON.stringify(fatal.mock.calls)).not.toContain("Bea Mendoza");
    }
  });
});
