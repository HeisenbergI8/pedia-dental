import { smsSegments } from "@pedia/shared";
import type { Env } from "../config/env";
import { SmsInDoubt, SmsRejected, SmsUnavailable, type SmsProvider, type SmsReceipt, type SmsSend } from "./sms-provider";

const TIMEOUT_MS = 10_000; // a batch of 10 stays well inside OUTBOX_POLICY.leaseMs (5 min)

/** Statuses that say the request wasn't processed: retry. Anything else ≥ 500 may have been: in doubt (E3). */
const NOT_TAKEN = new Set([401, 403, 429, 502, 503, 504]);

/**
 * Semaphore's v4 "send messages" call: a form POST of apikey, number, message and (optional) sendername, answered with
 * a JSON array whose items carry `message_id`. Taken from Semaphore's documentation as summarised, not read in full:
 * confirm it against api.semaphore.co/docs before setting the key (plan Question 5). Only this file changes if it differs.
 * Never puts the response into an error: it echoes the number and the words.
 */
export class SemaphoreSmsProvider implements SmsProvider {
  readonly name = "semaphore" as const;
  constructor(
    private readonly env: Pick<Env, "SEMAPHORE_API_KEY" | "SMS_SENDER_NAME" | "SEMAPHORE_URL">,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send({ number, body }: SmsSend): Promise<SmsReceipt> {
    const form = new URLSearchParams({ apikey: this.env.SEMAPHORE_API_KEY!, number, message: body });
    if (this.env.SMS_SENDER_NAME) form.set("sendername", this.env.SMS_SENDER_NAME); // decision 18: not chosen yet
    let res: Response;
    try {
      res = await this.http(this.env.SEMAPHORE_URL, { method: "POST", body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // A timeout or a connection dropped mid-request may have reached Semaphore; a refused connection or DNS didn't.
      const refused = e instanceof TypeError && /ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(String((e as { cause?: unknown }).cause));
      throw refused ? new SmsUnavailable() : new SmsInDoubt();
    }
    if (res.ok) {
      const items = (await res.json().catch(() => null)) as { message_id?: number | string }[] | null;
      const ref = Array.isArray(items) && items[0]?.message_id != null ? String(items[0].message_id) : undefined;
      if (!ref) throw new SmsInDoubt(); // 2xx without a reference: taken or not, we can't tell
      return { providerRef: `semaphore:${ref}`, segments: smsSegments(body) };
    }
    if (NOT_TAKEN.has(res.status)) throw new SmsUnavailable();
    if (res.status >= 400 && res.status < 500) throw new SmsRejected();
    throw new SmsInDoubt();
  }
}
