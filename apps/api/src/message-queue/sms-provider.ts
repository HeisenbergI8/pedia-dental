/** One text, as the provider takes it. `messageId` is ours: logged, never sent. */
export type SmsSend = { messageId: string; number: string; body: string };
/** What the provider took: its reference, and the parts it billed. */
export type SmsReceipt = { providerRef: string; segments: number };

/** Semaphore, or the log driver until an API key is set (decision 11, E11). Picked once, at startup. */
export interface SmsProvider {
  readonly name: "log" | "semaphore";
  send(sms: SmsSend): Promise<SmsReceipt>;
}
export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

/** The provider refused this text for good (a bad number). No retry; the text shows "refused". */
export class SmsRejected extends Error {
  override name = "SmsRejected";
}
/** The provider definitely didn't take it (down, rate-limited, refused our key). Retried. */
export class SmsUnavailable extends Error {
  override name = "SmsUnavailable";
}
/** It may have been taken (a timeout, a dropped connection, a 500). Never sent again (E3). */
export class SmsInDoubt extends Error {
  override name = "SmsInDoubt";
}
