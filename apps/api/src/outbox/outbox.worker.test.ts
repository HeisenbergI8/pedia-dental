import { describe, expect, it } from "vitest";
import { Prisma } from "../generated/prisma/client.ts";
import { backoffMs, describeError, nextDelayMs } from "./outbox.worker";

describe("backoffMs", () => {
  it("doubles from 30 seconds and stops at an hour", () => {
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 3_600_000]);
  });
});

describe("describeError", () => {
  it("keeps the name and the Prisma code, never the message", () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed: Maria Santos", { code: "P2002", clientVersion: "7.10.0" });
    expect(describeError(prismaError)).toBe("Prisma P2002");
    expect(describeError(new TypeError("+63 917 555 0101"))).toBe("TypeError");
    expect(describeError("+63 917 555 0101")).toBe("string");
  });
});

describe("nextDelayMs", () => {
  it("keeps the default schedule for a kind without its own, and gives up after 5 tries", () => {
    expect([1, 2, 3, 4, 5].map((n) => nextDelayMs({}, n))).toEqual([30_000, 60_000, 120_000, 240_000, undefined]);
  });

  it("follows a kind's own delays, and gives up when they run out", () => {
    const sms = { retryDelaysMs: [60_000, 300_000, 1_800_000] };
    expect([1, 2, 3, 4].map((n) => nextDelayMs(sms, n))).toEqual([60_000, 300_000, 1_800_000, undefined]);
  });
});
