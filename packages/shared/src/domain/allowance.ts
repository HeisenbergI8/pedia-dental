import type { LoggedMessageKind } from "../schemas/message";
import type { TextPackPrice } from "../schemas/signup";
import type { Tier } from "../schemas/tenancy";
import { isFreeText } from "./portal";
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

/**
 * The month's text allowance in billed parts: the plan's, plus the top-up parts confirmed for that Manila month
 * (D1: no rollover). Every reader of the cap goes through this, never `TIER_LIMITS[tier].textParts` alone.
 */
export const textAllowance = (tier: Tier, topUpParts: number) => TIER_LIMITS[tier].textParts + topUpParts;

/** A top-up receipt's parts and amount: the pack on the list when it was sent (D3), times the packs. */
export const textTopUpQuote = (pack: TextPackPrice, packs: number) => ({ parts: pack.parts * packs, amount: pack.price * packs });

/** B12 decision 18: the text month is the Manila calendar month, from the server's Manila date (never a browser Date). */
export const manilaMonth = (day: string) => day.slice(0, 7);

/**
 * B12 decisions 3, 19: a clinic's text that would pass the month's parts is logged as not sent. Since the text-abuse
 * limits an invite counts too (staff send it); a password reset or a number-change warning always goes (isFreeText).
 */
export function textPartsRefusal(kind: LoggedMessageKind, usedParts: number, addingParts: number, limit: number): string | undefined {
  if (isFreeText(kind)) return undefined;
  return usedParts + addingParts > limit ? FAILURE.textLimit : undefined;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1]!;
const nextMonthName = (month: string) => MONTHS[Number(month.slice(5, 7)) % 12]!;

/** Fewer parts than this left and a normal reminder no longer fits, so reminders are in effect already refused (BotC-7). */
export const TEXT_PARTS_NEARLY_GONE = 5;

/**
 * B12 decision 3: the Owner's warning at 80% and notice at the limit. The notice shows once fewer than
 * TEXT_PARTS_NEARLY_GONE parts are left, since a reminder needs more than that. Undefined below 80%.
 */
export function textAllowanceNotice(texts: { inUse: number; limit: number | null }, month: string): { level: "warning" | "limit"; text: string } | undefined {
  const { inUse, limit } = texts;
  if (!limit) return undefined;
  if (limit - inUse < TEXT_PARTS_NEARLY_GONE) {
    const forMonth = `for ${monthName(month)} ${month.slice(0, 4)}`;
    const used = inUse >= limit ? `You've used all ${limit} texts ${forMonth}` : `You've used ${inUse} of your ${limit} texts ${forMonth}, too few for another reminder`;
    return {
      level: "limit",
      text: `${used}. Automatic reminders and portal invites are not sent until 1 ${nextMonthName(month)} or until you buy more; password resets still go. Buy more texts, or contact Primolar to upgrade.`,
    };
  }
  if (inUse >= limit * 0.8) {
    return {
      level: "warning",
      text: `You've used ${inUse} of your ${limit} texts this month. At ${limit}, automatic reminders and portal invites stop until 1 ${nextMonthName(month)}. Buy more texts, or contact Primolar to upgrade.`,
    };
  }
  return undefined;
}

/** The invite refused before it is queued, when this month's texts can't carry it (staff send invites: they count). */
export const inviteTextsUsedUpMessage = (month: string) =>
  `Your clinic has used this month's texts, so the invite can't be sent. Buy more texts under Settings → Plan, or invite again on 1 ${nextMonthName(month)}.`;

/**
 * The platform's daily ceiling on billed parts across every clinic (text-abuse limits, 2026-11-27): a safety net for a
 * bug or an abused login, never the normal limit (each clinic's month is). Every active clinic's month spread over 30
 * days, times 3 for a busy day, and never below DAILY_TEXT_PARTS_FLOOR; `max` (SMS_DAILY_PARTS_MAX) caps it.
 */
export const DAILY_TEXT_PARTS_FLOOR = 500;
export function dailyTextCap(monthlyAllowances: readonly number[], max?: number): number {
  const total = monthlyAllowances.reduce((n, a) => n + a, 0);
  const cap = Math.max(DAILY_TEXT_PARTS_FLOOR, Math.ceil((total / 30) * 3));
  return max === undefined ? cap : Math.min(cap, max);
}
