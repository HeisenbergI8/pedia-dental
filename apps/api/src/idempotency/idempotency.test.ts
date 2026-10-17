import { BadRequestException } from "@nestjs/common";
import { IDEMPOTENCY_KEY_MISSING } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { fingerprintOf, keyOf } from "./idempotency.service";

describe("Idempotency-Key (B8 E2)", () => {
  it("takes a well-formed key from the header, else 400 in the shared words", () => {
    for (const header of [undefined, "short", "has a space here", ["a-very-long-key-1", "a-very-long-key-2"]]) {
      expect(() => keyOf(header)).toThrow(new BadRequestException(IDEMPOTENCY_KEY_MISSING));
    }
    const uuid = crypto.randomUUID();
    expect(keyOf(uuid)).toBe(uuid);
  });

  it("fingerprints a request the same whatever its key order, and apart for another actor, record or amount", () => {
    const base = { route: "POST /invoices/:id/payments", params: { id: "i1" }, actor: "u1", body: { amount: 100, method: "cash" } };
    const same = fingerprintOf({ ...base, body: { method: "cash", amount: 100 } });
    expect(fingerprintOf(base)).toBe(same);
    for (const other of [{ ...base, actor: "u2" }, { ...base, params: { id: "i2" } }, { ...base, body: { amount: 101, method: "cash" } }]) {
      expect(fingerprintOf(other)).not.toBe(same);
    }
  });
});
