import { HttpResponse } from "msw";
import { IDEMPOTENCY_HEADER, IDEMPOTENCY_KEY_MISSING, IDEMPOTENCY_KEY_REUSED } from "@pedia/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { idempotencyKey, once, resetIdempotency } from "./idempotency";

let clinic = "clinic_a";
vi.mock("./db", () => ({ currentClinicId: () => clinic }));

const withKey = (key: string | null) => new Request("http://x/api", { method: "POST", headers: key === null ? {} : { [IDEMPOTENCY_HEADER]: key } });
const created = (body: object) => vi.fn(() => HttpResponse.json(body, { status: 201 }));

describe("the mock's Idempotency-Key (B8 E2, E12)", () => {
  afterEach(() => {
    resetIdempotency();
    clinic = "clinic_a";
    vi.useRealTimers();
  });

  it("asks for a well-formed key", async () => {
    for (const key of [null, "short", "has a space in it"]) {
      const res = idempotencyKey(withKey(key)) as Response;
      expect([res.status, await res.text()]).toEqual([400, IDEMPOTENCY_KEY_MISSING]);
    }
    const uuid = crypto.randomUUID();
    expect(idempotencyKey(withKey(uuid))).toBe(uuid);
  });

  it("runs a request once and replays its answer", async () => {
    const write = created({ id: "p1" });
    await once("key-0001", { amount: 1 }, write);
    const again = await once("key-0001", { amount: 1 }, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect([again.status, again.headers.get("Idempotent-Replayed"), await again.json()]).toEqual([201, "true", { id: "p1" }]);
  });

  it("refuses the key for a different request", async () => {
    await once("key-0001", { amount: 1 }, created({ id: "p1" }));
    const write = created({ id: "p2" });
    const res = await once("key-0001", { amount: 2 }, write);
    expect([res.status, await res.text(), write.mock.calls.length]).toEqual([422, IDEMPOTENCY_KEY_REUSED, 0]);
  });

  it("keeps no refusal, so the key can be retried", async () => {
    await once("key-0001", {}, () => new HttpResponse("Too much", { status: 409 }));
    const write = created({ id: "p1" });
    await once("key-0001", {}, write);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("scopes keys to the clinic and forgets them after 24 hours", async () => {
    const write = created({ id: "p1" });
    await once("key-0001", {}, write);
    clinic = "clinic_b";
    await once("key-0001", {}, write);
    expect(write).toHaveBeenCalledTimes(2);
    vi.useFakeTimers({ now: Date.now() + 24 * 60 * 60_000 + 1 });
    await once("key-0001", {}, write);
    expect(write).toHaveBeenCalledTimes(3);
  });
});
