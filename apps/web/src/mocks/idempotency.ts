import { HttpResponse, type JsonBodyType } from "msw";
import { IDEMPOTENCY_HEADER, IDEMPOTENCY_KEY_MISSING, IDEMPOTENCY_KEY_REUSED, IdempotencyKey } from "@pedia/shared";
import { currentClinicId } from "./db";

/** The API's IDEMPOTENCY_TTL_MS (B8 E2). */
const TTL_MS = 24 * 60 * 60_000;
type Kept = { fingerprint: string; status: number; body: JsonBodyType; at: number };

/**
 * The mock's side of B8 E2, in memory per clinic (E12): a retry comes from the same page session, and nothing on
 * screen depends on it. Not in `db`, so `Db` and the storage key don't change.
 */
const kept = new Map<string, Kept>();

/** The request's key, or the 400 to return as is. */
export function idempotencyKey(request: Request): string | Response {
  const key = IdempotencyKey.safeParse(request.headers.get(IDEMPOTENCY_HEADER));
  return key.success ? key.data : new HttpResponse(IDEMPOTENCY_KEY_MISSING, { status: 400 });
}

/**
 * Runs `write` once per key: the same request again answers what the first did, records nothing and says so in
 * `Idempotent-Replayed`; a different request with the key is 422. Only a success is kept, so a refused request can
 * be retried with its key. Handlers run one at a time between awaits, so the check and the write can't interleave.
 */
export async function once(key: string, fingerprint: unknown, write: () => Response | Promise<Response>): Promise<Response> {
  const id = `${currentClinicId()} ${key}`;
  const print = JSON.stringify(fingerprint);
  const hit = kept.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) {
    if (hit.fingerprint !== print) return new HttpResponse(IDEMPOTENCY_KEY_REUSED, { status: 422 });
    return HttpResponse.json(hit.body, { status: hit.status, headers: { "Idempotent-Replayed": "true" } });
  }
  const res = await write();
  if (res.ok) kept.set(id, { fingerprint: print, status: res.status, body: (await res.clone().json()) as JsonBodyType, at: Date.now() });
  return res;
}

/** Tests only: forget every key. */
export const resetIdempotency = () => kept.clear();
