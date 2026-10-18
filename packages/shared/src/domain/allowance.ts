import type { LoggedMessageKind } from "../schemas/message";
import type { Tier } from "../schemas/tenancy";
import { isAccountText } from "./portal";
import { FAILURE } from "./sending";
import { TIER_LABEL, TIER_LIMITS } from "./tenancy";

/** A gibibyte: the plans' storage is counted in bytes (B12 decision 1). */
export const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "350 MB", "1.4 GB", "50 GB": one decimal under 10 GB, none above, MB below 1 GB. */
export function formatStorage(bytes: number): string {
  if (bytes < GB) return `${Math.round(bytes / MB)} MB`;
  const gb = bytes / GB;
  return `${gb < 10 ? Math.round(gb * 10) / 10 : Math.round(gb)} GB`;
}

/** B12 decision 1: refused at the limit, files already stored stay. */
export const storageFullMessage = (tier: Tier) =>
  `Your clinic's storage is full: the ${TIER_LABEL[tier]} plan includes ${formatStorage(TIER_LIMITS[tier].storageBytes)}. Files already stored stay. Contact Primolar to upgrade to upload more.`;

/** The refusal when this upload would pass the plan's storage; exactly at the limit is allowed. */
export const storageRefusal = (tier: Tier, usedBytes: number, addingBytes: number): string | undefined =>
  usedBytes + addingBytes > TIER_LIMITS[tier].storageBytes ? storageFullMessage(tier) : undefined;

/** B12 decision 18: the text month is the Manila calendar month, from the server's Manila date (never a browser Date). */
export const manilaMonth = (day: string) => day.slice(0, 7);

/**
 * B12 decisions 3, 19: a clinic's template text that would pass the month's parts is logged as not sent. An invite or a
 * password reset (B11) always goes.
 */
export function textPartsRefusal(kind: LoggedMessageKind, usedParts: number, addingParts: number, limit: number): string | undefined {
  if (isAccountText(kind)) return undefined;
  return usedParts + addingParts > limit ? FAILURE.textLimit : undefined;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1]!;
const nextMonthName = (month: string) => MONTHS[Number(month.slice(5, 7)) % 12]!;

/** B12 decision 3: the Owner's warning at 80% and notice at 100% of the month's texts. Undefined below 80%. */
export function textAllowanceNotice(texts: { inUse: number; limit: number | null }, month: string): { level: "warning" | "limit"; text: string } | undefined {
  const { inUse, limit } = texts;
  if (!limit) return undefined;
  if (inUse >= limit) {
    return {
      level: "limit",
      text: `You've used all ${limit} texts for ${monthName(month)} ${month.slice(0, 4)}. Automatic reminders are not sent until 1 ${nextMonthName(month)}; portal invites and password resets still go. Contact Primolar to upgrade for more.`,
    };
  }
  if (inUse >= limit * 0.8) {
    return { level: "warning", text: `You've used ${inUse} of your ${limit} texts this month. At ${limit}, automatic reminders stop until 1 ${nextMonthName(month)}.` };
  }
  return undefined;
}
