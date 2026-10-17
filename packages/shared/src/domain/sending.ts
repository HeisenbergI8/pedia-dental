import { addDays, setHours, startOfDay } from "date-fns";

/** Decision 4: texts go out 8 AM–8 PM Manila only. Local hours: the API's process runs in Asia/Manila. */
export const SENDING_HOURS = { from: 8, until: 20 } as const;

/** `at` if it is inside sending hours, else the next 8 AM. 8:00:00 is in; 20:00:00 is out. */
export function nextSendingTime(at: Date): Date {
  const h = at.getHours();
  if (h >= SENDING_HOURS.from && h < SENDING_HOURS.until) return at;
  const day = h < SENDING_HOURS.from ? startOfDay(at) : startOfDay(addDays(at, 1));
  return setHours(day, SENDING_HOURS.from);
}

/** Decision 5: three retries, about 1 min, 5 min and 30 min after a failed try. Four tries in all. */
export const MESSAGE_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;

/**
 * A Philippine mobile number as the SMS provider takes it (639XXXXXXXXX), or undefined (decision 12).
 * Accepts 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX and +639XXXXXXXXX, with spaces, dashes or dots.
 */
export function smsNumber(phone: string | undefined): string | undefined {
  const d = (phone ?? "").replace(/[\s.()-]/g, "").replace(/^\+/, "");
  const m = /^(?:63|0)?(9\d{9})$/.exec(d);
  return m ? `63${m[1]}` : undefined;
}

/** How many texts a body costs: 160 GSM characters in one, 153 per part when split. Non-GSM text: 70 / 67. */
export function smsSegments(body: string): number {
  const gsm = /^[\x20-\x7E\n\r£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ¡ÄÖÑÜ§¿äöñüà€]*$/.test(body);
  const [one, part] = gsm ? [160, 153] : [70, 67];
  return body.length <= one ? 1 : Math.ceil(body.length / part);
}

/** The reasons a text shows as failed in /messages. Plain words; never an error message from a library. */
export const FAILURE = {
  noPhone: "No phone number",
  rejected: "The SMS provider refused this number",
  gaveUp: "Couldn't be sent after 4 tries",
  notConfirmed: "Not confirmed by the SMS provider",
} as const;
