import { format, parseISO } from "date-fns";

/** "0917 123 4567": a PH mobile chunked for reading aloud on the phone. Anything else is shown as stored. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : phone;
}

/** "Nov 24, 2011": the app's one date format. A month name can't be misread as 11/24 vs 24/11. */
export function formatDate(isoDate: string): string {
  return format(parseISO(isoDate), "MMM d, yyyy");
}

/** "Dr. Ana Reyes" → "Ana Reyes": greetings and avatars address the person, not the title. */
export const withoutTitle = (name: string) => name.replace(/^Dr\.\s*/, "");
/** "Dr. Ana Reyes" → "Ana". */
export const firstName = (name: string) => withoutTitle(name).split(/\s+/)[0];

/** "AC" from "Ana Cruz", for avatars. */
export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}
