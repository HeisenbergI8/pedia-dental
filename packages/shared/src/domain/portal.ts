import { smsNumber } from "./sending";

/** Decisions 5 and 6: how long a link works, from when it was made. Data, not `if` statements. */
export const PORTAL_LINK_LIFETIME_MS = { invite: 72 * 60 * 60_000, reset: 30 * 60_000 } as const;
export type PortalLinkPurpose = keyof typeof PORTAL_LINK_LIFETIME_MS;
/** Decision 19: reset texts per number (or email) per hour. */
export const RESET_TEXTS_PER_HOUR = 3;
/** Where the link sits in a logged account text. The real link is put in only by the sender (B11 E5). */
export const LINK_MARK = "[link]";
/** The web page a link opens; the token rides in the fragment, which no server log sees (E1). */
export const SET_PASSWORD_PATH = "/set-password";
export const linkPath = (token: string) => `${SET_PASSWORD_PATH}#t=${token}`;

/**
 * What a sign-in box holds, in the one form every side compares (decision 4, E3): a Philippine mobile as `smsNumber`
 * gives it (639XXXXXXXXX), an email lowercased. Undefined for anything else.
 */
export function loginIdOf(raw: string): { kind: "phone" | "email"; value: string } | undefined {
  const s = raw.trim();
  if (s.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { kind: "email", value: s.toLowerCase() } : undefined;
  const phone = smsNumber(s);
  return phone ? { kind: "phone", value: phone } : undefined;
}

/** "0917 ••• 4567": enough for a parent to recognise their number, too little to learn someone else's. */
export function maskedNumber(phone: string | undefined): string {
  const n = smsNumber(phone);
  return n ? `0${n.slice(2, 5)} ••• ${n.slice(-4)}` : "your number";
}

/** Account texts aren't clinic templates (E4): fixed words, the link last so a split text keeps it whole. */
export function accountText(purpose: PortalLinkPurpose, v: { clinicName: string; childName?: string }, link = LINK_MARK): string {
  return purpose === "invite"
    ? `${v.clinicName}: You're invited to the parent portal${v.childName ? ` for ${v.childName}` : ""}. Set your password within 72 hours: ${link}`
    : `${v.clinicName}: Reset your parent portal password within 30 minutes. Didn't ask? Ignore this text. ${link}`;
}

/** Audit #21: to the old number when a parent's sign-in number changes. No link, so nothing to take over. */
export const numberChangedText = (clinicName: string) =>
  `Your Primolar sign-in number for ${clinicName} was changed. If this wasn't you, call the clinic.`;

/** Fixed-word texts about a parent's portal account: sent at any hour, and never deciding a child's "no contact". */
export const ACCOUNT_TEXT_KINDS = ["portal_invite", "password_reset", "sign_in_changed"] as const;
export const isAccountText = (kind: string | undefined) => (ACCOUNT_TEXT_KINDS as readonly string[]).includes(kind ?? "");

/**
 * Text-abuse limits (2026-11-27): the account texts a clinic never pays for, because a parent or a stranger asks for
 * them (audit #3: a stranger asking for resets must not use up the clinic's month). They never count toward the month's
 * texts, are never refused for it, and pass the platform's daily cap. An invite is sent by the clinic's staff, so it
 * counts and is refused like a template text.
 */
export const FREE_TEXT_KINDS = ["password_reset", "sign_in_changed"] as const;
export const isFreeText = (kind: string | undefined) => (FREE_TEXT_KINDS as readonly string[]).includes(kind ?? "");

const DAY_MS = 24 * 60 * 60_000;
/**
 * Audit #3, #4, #21: what keeps account texts (never refused, never counted) from being a free bulk-SMS service. Rolling
 * 24 hours. Data, not `if` statements.
 * - `invitesPerGuardian`, `invitesPerClinic`: staff sends; past them the invite is refused (429, `inviteLimitMessage`).
 * - `resetsPerClinic`: reset texts a clinic's parents may be sent; past it a request still answers 202 and sends nothing.
 * - `resetHoldAfterNumberChangeMs`: no reset text for a login whose number changed this recently (202, nothing sent).
 * - `resetsPerLoginPerDay`: reset requests per number (or email) in the day, on top of RESET_TEXTS_PER_HOUR (429).
 */
export const ACCOUNT_TEXT_LIMITS = {
  windowMs: DAY_MS,
  invitesPerGuardian: 3,
  invitesPerClinic: 200,
  resetsPerClinic: 30,
  resetHoldAfterNumberChangeMs: DAY_MS,
  resetsPerLoginPerDay: 5,
} as const;

/** The 429 staff see past an invite limit, in plain words. */
export const inviteLimitMessage = (scope: "guardian" | "clinic", guardianName?: string) =>
  scope === "guardian"
    ? `${guardianName ?? "This parent"} has been sent ${ACCOUNT_TEXT_LIMITS.invitesPerGuardian} portal invites in the last day. Try again tomorrow.`
    : `Your clinic has sent ${ACCOUNT_TEXT_LIMITS.invitesPerClinic} portal invites in the last day. Try again tomorrow.`;

/** Which invite limit one more invite would pass, given the last day's counts; undefined when it may go. */
export function inviteLimitReached(sentToGuardian: number, sentByClinic: number): "guardian" | "clinic" | undefined {
  if (sentToGuardian >= ACCOUNT_TEXT_LIMITS.invitesPerGuardian) return "guardian";
  if (sentByClinic >= ACCOUNT_TEXT_LIMITS.invitesPerClinic) return "clinic";
  return undefined;
}

/** Why a reset text is held back (still 202, nothing sent), or undefined when it may go. */
export function resetHeld(resetsByClinic: number, numberChangedAt: Date | undefined, now: Date): "clinic_ceiling" | "number_changed" | undefined {
  if (numberChangedAt && now.getTime() - numberChangedAt.getTime() < ACCOUNT_TEXT_LIMITS.resetHoldAfterNumberChangeMs) return "number_changed";
  if (resetsByClinic >= ACCOUNT_TEXT_LIMITS.resetsPerClinic) return "clinic_ceiling";
  return undefined;
}
