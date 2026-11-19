import { formatDate } from "@/lib/format";

/**
 * Bot report #27: the clinic's day and clock are Manila's, as the API and the PDFs read them, whatever zone the
 * device is set to. Philippine time has no daylight saving.
 */
const ZONE = "Asia/Manila";

/** The Manila calendar day of an instant (now by default), "2026-11-19". */
export const manilaDay = (at: string | Date = new Date()) => new Date(at).toLocaleDateString("en-CA", { timeZone: ZONE });

/** "4:35 PM" in Manila. ICU puts a narrow space before AM/PM; a plain one matches the rest of the app. */
export const manilaTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" }).replace(/\s/g, " ");

/** "Nov 19, 2026": the Manila day of a timestamp (a bill's issue date), in the app's one date format. */
export const manilaDate = (iso: string) => formatDate(manilaDay(iso));

/** "Nov 19, 2026 4:35 PM" in Manila. */
export const manilaDateTime = (iso: string) => `${manilaDate(iso)} ${manilaTime(iso)}`;
