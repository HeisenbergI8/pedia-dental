import { describe, expect, it } from "vitest";
import { MESSAGE_RETRY_DELAYS_MS, nextSendingTime, smsNumber, smsSegments } from "./sending";

const at = (y: number, m: number, d: number, h: number, min = 0, s = 0) => new Date(y, m, d, h, min, s);

describe("nextSendingTime", () => {
  it("keeps a time inside 8 AM–8 PM and moves anything else to the next 8 AM", () => {
    expect(nextSendingTime(at(2026, 9, 17, 7, 59))).toEqual(at(2026, 9, 17, 8));
    expect(nextSendingTime(at(2026, 9, 17, 8))).toEqual(at(2026, 9, 17, 8));
    expect(nextSendingTime(at(2026, 9, 17, 19, 59, 59))).toEqual(at(2026, 9, 17, 19, 59, 59));
    expect(nextSendingTime(at(2026, 9, 17, 20))).toEqual(at(2026, 9, 18, 8));
    expect(nextSendingTime(at(2026, 11, 31, 23, 30))).toEqual(at(2027, 0, 1, 8));
  });
});

describe("smsNumber", () => {
  it("normalises a Philippine mobile and refuses anything else", () => {
    expect(smsNumber("0917 123 4567")).toBe("639171234567");
    expect(smsNumber("+63 917-123-4567")).toBe("639171234567");
    expect(smsNumber("9171234567")).toBe("639171234567");
    for (const bad of ["", "1234567", "0281234567", undefined]) expect(smsNumber(bad)).toBeUndefined();
  });
});

describe("smsSegments", () => {
  it("counts the parts a body is billed as", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("a".repeat(480))).toBe(4);
    expect(smsSegments("₱".repeat(71))).toBe(2);
  });
});

it("retries three times (decision 5)", () => {
  expect(MESSAGE_RETRY_DELAYS_MS).toHaveLength(3);
});
