import { IdempotencyKey } from "@pedia/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, UNREACHABLE } from "./api-client";
import { newKey, outcomeKnown } from "./idempotency";

describe("idempotency keys in the web (B8 E2)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("starts a new key only once the server's answer is known", () => {
    for (const status of [400, 403, 409, 422]) expect(outcomeKnown(new ApiError(status, "No")), String(status)).toBe(true);
    expect(outcomeKnown(new ApiError(500, "Something went wrong"))).toBe(false);
    expect(outcomeKnown(new ApiError(404, UNREACHABLE))).toBe(false); // a page where JSON belongs: never reached the API
    expect(outcomeKnown(new TypeError("Failed to fetch"))).toBe(false);
  });

  it("makes keys the API accepts, with or without randomUUID", () => {
    expect(IdempotencyKey.safeParse(newKey()).success).toBe(true);
    vi.stubGlobal("crypto", { getRandomValues: (a: Uint8Array) => a.fill(7) });
    expect(IdempotencyKey.safeParse(newKey()).success).toBe(true);
  });
});
