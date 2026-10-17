import { Logger } from "@nestjs/common";
import { smsSegments } from "@pedia/shared";
import type { SmsProvider, SmsReceipt, SmsSend } from "./sms-provider";

/**
 * Decision 11: what "sending" means until SEMAPHORE_API_KEY is set, production included. Logs the message id and its
 * parts only: never the number or the body (CONVENTIONS → never log patient data).
 */
export class LogSmsProvider implements SmsProvider {
  readonly name = "log" as const;
  private readonly log = new Logger("SmsLog");
  async send({ messageId, body }: SmsSend): Promise<SmsReceipt> {
    const segments = smsSegments(body);
    this.log.log(`SMS ${messageId} (${segments} part${segments === 1 ? "" : "s"}) logged, not sent`);
    return { providerRef: `log:${messageId}`, segments };
  }
}
