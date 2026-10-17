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

export const ACCOUNT_TEXT_KINDS = ["portal_invite", "password_reset"] as const;
export const isAccountText = (kind: string | undefined) => (ACCOUNT_TEXT_KINDS as readonly string[]).includes(kind ?? "");
