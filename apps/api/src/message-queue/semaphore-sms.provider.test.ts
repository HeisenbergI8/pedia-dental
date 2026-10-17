import { describe, expect, it, vi } from "vitest";
import { SemaphoreSmsProvider } from "./semaphore-sms.provider";
import { SmsInDoubt, SmsRejected, SmsUnavailable } from "./sms-provider";

const env = { SEMAPHORE_API_KEY: "key_1", SMS_SENDER_NAME: "CLINICNAME", SEMAPHORE_URL: "https://sms.test/api/v4/messages" };
const text = { messageId: "m1", number: "639171234567", body: "Hi Rosa, Bea's visit is tomorrow." };
const answer = (status: number, body: unknown = []) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
const refusal = (cause: string) => vi.fn<typeof fetch>(async () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: new Error(cause) })));

describe("SemaphoreSmsProvider", () => {
  it("posts the form and keeps Semaphore's message id", async () => {
    const http = answer(200, [{ message_id: 123 }]);
    expect(await new SemaphoreSmsProvider(env, http).send(text)).toEqual({ providerRef: "semaphore:123", segments: 1 });
    const [url, init] = http.mock.calls[0]!;
    expect(url).toBe(env.SEMAPHORE_URL);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(init!.body as URLSearchParams)).toEqual({ apikey: "key_1", number: text.number, message: text.body, sendername: "CLINICNAME" });
  });

  it("sends no sender name until one is chosen (decision 18)", async () => {
    const http = answer(200, [{ message_id: 1 }]);
    await new SemaphoreSmsProvider({ ...env, SMS_SENDER_NAME: undefined }, http).send(text);
    expect((http.mock.calls[0]![1]!.body as URLSearchParams).has("sendername")).toBe(false);
  });

  it.each([
    ["a 2xx with no message id", answer(200, []), SmsInDoubt],
    ["503", answer(503), SmsUnavailable],
    ["429", answer(429), SmsUnavailable],
    ["401", answer(401), SmsUnavailable],
    ["400", answer(400), SmsRejected],
    ["422", answer(422), SmsRejected],
    ["500", answer(500), SmsInDoubt],
    ["a refused connection", refusal("connect ECONNREFUSED"), SmsUnavailable],
    ["a timeout", vi.fn<typeof fetch>(async () => Promise.reject(new DOMException("timed out", "TimeoutError"))), SmsInDoubt],
  ])("reads %s as the right kind of failure, with nothing of the text in it", async (_, http, kind) => {
    const error = await new SemaphoreSmsProvider(env, http).send(text).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(kind);
    for (const secret of [text.number, "Rosa", "key_1"]) expect(String(error)).not.toContain(secret);
  });
});
