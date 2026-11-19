import { z } from "zod";

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** Every record belongs to one clinic account (the tenant). Mock handlers only ever see the signed-in account's rows. */
export const ClinicScoped = z.object({ clinicId: Id });
/** Records that also belong to one branch of the account: appointments, chairs, invoices and payments (decision #16). */
export const BranchScoped = ClinicScoped.extend({ branchId: Id });

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A real day of the calendar: 2026-02-30 and 2026-13-45 match the shape but aren't (B10 tester D2). */
const isRealDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/** YYYY-MM-DD, a day that exists, any year: for a field with its own earliest day and message (the date of birth). */
export const calendarDay = (message: string) => z.string().regex(DAY, message).refine(isRealDay, message);
/** Calendar date, YYYY-MM-DD, a day that exists, from 1900. Pass a message to word the error for a specific field. */
export const isoDate = (message = "Enter a date") => calendarDay(message).refine((s) => s >= "1900-01-01", message);
export const IsoDate = isoDate();

/** Today's date in Manila (UTC+8, no daylight saving), yyyy-MM-dd, wherever the code runs: what "the future" means. */
export const manilaToday = (now = new Date()) => new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
/** `day` (yyyy-MM-dd) moved by `days` calendar days. */
export const addDaysTo = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** A day that already happened (a photo taken, a payment made, an agreement signed): today in Manila at the latest. */
export const pastIsoDate = (message = "Enter a date", future = "This date can't be in the future") =>
  isoDate(message).refine((d) => d <= manilaToday(), future);

/** A Manila calendar month, "2026-11": the text allowance's month and a top-up's (B12 decision 18). */
export const YearMonth = z.string().regex(/^\d{4}-\d{2}$/);
/** Full timestamp, ISO 8601. */
export const IsoDateTime = z.string().datetime({ offset: true });

/** Issue 45: the limit itself is allowed, so the message says so ("Keep the reason to 500 characters or fewer"). */
export const tooLong = (max: number, what = "this") => `Keep ${what} to ${max.toLocaleString("en-US")} characters or fewer`;

/**
 * A typed name as it is kept (issue 26): invisible format characters (Unicode Cf: zero-width spaces and joiners,
 * right-to-left overrides) removed and the characters composed (NFC). Not NFKC: that would rewrite real names
 * ("Mª" → "Ma"). Lookalike folding is for comparison keys only (clinicNameKey).
 */
export const cleanName = (s: string) => s.replace(/\p{Cf}/gu, "").normalize("NFC");
/** The size of a MySQL `String` column (VARCHAR(191)) in apps/api/prisma/schema.prisma. */
export const TEXT_COLUMN_MAX = 191;
/** A person's or place's name: cleaned, trimmed, required, at most `max` characters. */
export const nameText = (required: string, max = TEXT_COLUMN_MAX, what = "the name") =>
  z.string().overwrite(cleanName).trim().min(1, required).max(max, tooLong(max, what));

/** Money is always integer centavos. Never floats. Unbounded, since computed totals (a month's collections) use it too. */
export const Centavos = z.number().int();
export type Centavos = z.infer<typeof Centavos>;

/** ₱10,000,000: the most one typed amount may be (issue 23), well inside the database's 32-bit money columns. */
export const MAX_CENTAVOS = 1_000_000_000;
const AMOUNT_TOO_BIG = "Amounts can be at most ₱10,000,000";
/** One amount someone types (a fee, a price, a payment, a refund, a discount): at most ₱10,000,000 either way. */
export const CentavosAmount = Centavos.min(-MAX_CENTAVOS, AMOUNT_TOO_BIG).max(MAX_CENTAVOS, AMOUNT_TOO_BIG);

/** Who is signed in. `owner` is the account's master login (decision #11), above admin; never a job on a staff record. */
export const Role = z.enum(["owner", "admin", "dentist", "front_desk", "parent"]);
export type Role = z.infer<typeof Role>;
/** The job on a staff record. An Owner keeps one too (Owner + Dentist), which is what books, signs and charts. */
export const StaffRole = Role.exclude(["owner", "parent"]);
export type StaffRole = z.infer<typeof StaffRole>;
