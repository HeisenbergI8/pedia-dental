import { DEMO_PASSWORD, allAccounts, staffEmail, type AccountMatch, type DemoAccountRecord } from "@pedia/seed";
import { credentialOf, type Db, type Platform } from "./db";

/** Who signs in with which email lives in packages/seed (shared with the API). Re-exported for the mocks. */
export {
  DEMO_PASSWORD, accountsByEmail, allAccounts, childrenOf, demoAccounts, demoLogins, handle, staffEmail,
  type AccountMatch, type DemoAccountRecord,
} from "@pedia/seed";

/** `demo.<clinic id>.<account id>`. Clinic ids never contain a dot; account ids may (`guardian.<id>`). */
export const tokenFor = (clinicId: string, account: { id: string }) => `demo.${clinicId}.${account.id}`;
const TOKEN = /^demo\.([^.]+)\.(.+)$/;

/** Who a token names, and in which clinic account. Undefined for an unknown token or an unknown account. */
export function accountForToken(platform: Platform, token: string | undefined): AccountMatch | undefined {
  const [, clinicId, accountId] = token?.match(TOKEN) ?? [];
  const tenant = clinicId ? platform.tenants[clinicId] : undefined;
  const account = tenant && allAccounts(tenant).find((a) => a.id === accountId);
  return account && { clinicId: clinicId!, account };
}

/** Does this password open this login? Its own password once it has one (an added or changed login), else the demo one. */
export const passwordOpens = (db: Db, account: Pick<DemoAccountRecord, "staffId">, password: string) =>
  (credentialOf(db, account.staffId)?.password ?? DEMO_PASSWORD) === password;

/**
 * Is this email already a login in the account? Deactivated staff count: they can be reactivated, and two logins with
 * one email would make sign-in ambiguous (decision #27: one login per email per account).
 */
export const emailTaken = (db: Db, email: string, exceptStaffId?: string) =>
  db.staff.some((s) => s.id !== exceptStaffId && staffEmail(s) === email) || allAccounts(db).some((a) => !a.staffId && a.email === email);

/** Readable at a glance and over the phone: no 0/O, 1/l/I. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY23456789";
const pick = (n: number, chars: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join("");
/**
 * "Kp7m-3xQa-9tLz": a new login's first password, shown once to whoever created it (the Owner adding staff, or the
 * operator creating an account's Owner), passed on by them, changed at first sign-in (decision #21).
 */
export const temporaryPassword = () => [pick(4, ALPHABET), pick(4, ALPHABET), pick(4, ALPHABET)].join("-");
/** A new login's Switch user PIN, shown once beside the temporary password. */
export const newPin = () => pick(4, "0123456789");
