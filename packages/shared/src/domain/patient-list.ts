import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Appointment } from "../schemas/appointment";
import type { Invoice } from "../schemas/billing";
import type { Message } from "../schemas/message";
import type { Patient } from "../schemas/patient";
import type { PatientFilter, PatientFlags, PatientSort } from "../schemas/patient-list";
import type { DueItem } from "../schemas/recall";
import type { Visit } from "../schemas/visit";
import { accountSummary, type BillTotals, type PaidRow } from "./money";
import { isAccountText } from "./portal";
import { dueBucket, isDueItemOpen, type DueBucket } from "./recall";
import { FAILURE } from "./sending";

/** "Recent visit": seen within this many days, today included. Data, not an `if` (CONVENTIONS, Domain rules). */
export const RECENT_VISIT_DAYS = 30;
/**
 * B14: a search (non-empty `q` on GET /patients) answers at most this many children, by name. ⌘K and the pickers show
 * 8, so 50 leaves room for the picker's "booked soon first" ranking. An empty `q` (the directory) is unchanged.
 */
export const PATIENT_SEARCH_LIMIT = 50;
/** "Recall due": the two most urgent sections of /recall. "This month" is not yet due. */
export const RECALL_DUE_BUCKETS: readonly DueBucket[] = ["overdue", "this_week"];

/** The clinic-local day of a timestamp: the same rule as finance.ts `dayOf`. */
const dayOf = (iso: string) => format(new Date(iso), "yyyy-MM-dd");

/** Every day this patient was seen: completed visits and done appointments (seeded ones have no Visit row). */
export function visitDays(
  patientId: string,
  visits: Pick<Visit, "patientId" | "status" | "date">[],
  appointments: Pick<Appointment, "patientId" | "status" | "startsAt">[],
): string[] {
  const days = [
    ...visits.filter((v) => v.patientId === patientId && v.status === "completed").map((v) => v.date),
    ...appointments.filter((a) => a.patientId === patientId && a.status === "done").map((a) => dayOf(a.startsAt)),
  ];
  return [...new Set(days)].sort();
}

export const lastVisitOn = (...args: Parameters<typeof visitDays>): string | undefined => visitDays(...args).at(-1);

/**
 * "No contact": the last message that actually went out (sent) or was tried (failed) failed. Queued and
 * cancelled messages say nothing about whether the number works. A later success clears it.
 */
/**
 * Failures that are the clinic's, not the family's number: the text was never tried (the month's text limit, B12
 * decision 19; a paused clinic, audit #24), so it says nothing about whether the family can be reached. The API's
 * `lastTried` must leave these out too.
 */
export const CLINIC_SIDE_FAILURES: readonly string[] = [FAILURE.textLimit, FAILURE.clinicPaused, FAILURE.dailyCap];

/**
 * An account text (an invite, a reset: B11) goes to one guardian about their login, so it never decides "no contact";
 * nor does a failure in CLINIC_SIDE_FAILURES.
 */
export function hasNoContact(
  patientId: string,
  messages: (Pick<Message, "patientId" | "status" | "sendAt"> & { kind?: Message["kind"]; failureReason?: string })[],
): boolean {
  const tried = messages
    .filter((m) => m.patientId === patientId && !isAccountText(m.kind) && (m.status === "sent" || m.status === "failed"))
    .filter((m) => !(m.status === "failed" && m.failureReason && CLINIC_SIDE_FAILURES.includes(m.failureReason)))
    // Same send time: a sent text wins (the family was reached), so the demo and the API agree whatever the order.
    .sort((a, b) => a.sendAt.localeCompare(b.sendAt) || (a.status === b.status ? 0 : a.status === "sent" ? 1 : -1));
  return tried.at(-1)?.status === "failed";
}

/** The earliest open follow-up or recall in RECALL_DUE_BUCKETS, or undefined. */
export function recallDueOn(
  patientId: string,
  dueItems: Pick<DueItem, "patientId" | "dueOn" | "appointmentId" | "closedAt" | "ruleId" | "createdAt">[],
  appointments: Pick<Appointment, "id" | "status" | "patientId" | "startsAt" | "procedureCode">[],
  today: string,
): string | undefined {
  return dueItems
    .filter((i) => i.patientId === patientId && isDueItemOpen(i, appointments))
    .map((i) => i.dueOn)
    .filter((dueOn) => RECALL_DUE_BUCKETS.includes(dueBucket(dueOn, today)!))
    .sort()[0];
}

export type PatientFacts = {
  visits: Pick<Visit, "patientId" | "status" | "date">[];
  appointments: Pick<Appointment, "id" | "patientId" | "status" | "startsAt" | "procedureCode">[];
  dueItems: Pick<DueItem, "patientId" | "dueOn" | "appointmentId" | "closedAt" | "ruleId" | "createdAt">[];
  invoices: (BillTotals & Pick<Invoice, "patientId">)[];
  payments: PaidRow[];
  messages: (Pick<Message, "patientId" | "status" | "sendAt"> & Partial<Pick<Message, "failureReason">>)[];
};

/** Everything the list shows about one patient, from the same sources as /recall and the dashboard. */
export function patientStanding(patientId: string, facts: PatientFacts, today: string) {
  const balance = accountSummary(facts.invoices.filter((i) => i.patientId === patientId), facts.payments).balance;
  const due = recallDueOn(patientId, facts.dueItems, facts.appointments, today);
  const flags: PatientFlags = { recallDue: !!due, balanceDue: balance > 0, noContact: hasNoContact(patientId, facts.messages) };
  return { balance, recallDueOn: due, lastVisitOn: lastVisitOn(patientId, facts.visits, facts.appointments), flags };
}

/** B14: what the API stores per patient (today-independent). The flags come from it and `today` (standingOn). */
export type StoredStanding = { lastVisitOn?: string; nextDueOn?: string; balance: number; noContact: boolean };

/** B14: the stored standing from source facts: the same rules as patientStanding, with no `today`. */
export function storedStanding(patientId: string, facts: PatientFacts): StoredStanding {
  const open = facts.dueItems.filter((i) => i.patientId === patientId && isDueItemOpen(i, facts.appointments)).map((i) => i.dueOn).sort();
  return {
    lastVisitOn: lastVisitOn(patientId, facts.visits, facts.appointments),
    nextDueOn: open[0],
    balance: accountSummary(facts.invoices.filter((i) => i.patientId === patientId), facts.payments).balance,
    noContact: hasNoContact(patientId, facts.messages),
  };
}

/**
 * B14: the list's day bounds for `today`: recent visit ⇔ lastVisitOn ≥ recentFrom; recall due ⇔ nextDueOn ≤ recallBy
 * (dueBucket's overdue and this_week are exactly "within 7 days", so the earliest open item decides).
 */
export function listBounds(today: string): { recentFrom: string; recallBy: string } {
  const t = parseISO(today);
  return { recentFrom: format(addDays(t, -(RECENT_VISIT_DAYS - 1)), "yyyy-MM-dd"), recallBy: format(addDays(t, 7), "yyyy-MM-dd") };
}

/** B14: patientStanding's answer from what is stored (patient-list.test.ts proves they agree). */
export function standingOn(s: StoredStanding, today: string): ReturnType<typeof patientStanding> {
  const recallDueOn = s.nextDueOn && s.nextDueOn <= listBounds(today).recallBy ? s.nextDueOn : undefined;
  return { balance: s.balance, recallDueOn, lastVisitOn: s.lastVisitOn, flags: { recallDue: !!recallDueOn, balanceDue: s.balance > 0, noContact: s.noContact } };
}

export const needsAttention = (f: PatientFlags) => f.recallDue || f.balanceDue || f.noContact;

type Row = { flags: PatientFlags; lastVisitOn?: string; balance?: number; firstName: string; lastName: string; id: string };

export function matchesFilter(filter: PatientFilter, row: Row, today: string): boolean {
  switch (filter) {
    case "all": return true;
    case "needs_attention": return needsAttention(row.flags);
    case "balance_due": return row.flags.balanceDue;
    case "recall_due": return row.flags.recallDue;
    case "recent_visit":
      return !!row.lastVisitOn && differenceInCalendarDays(parseISO(today), parseISO(row.lastVisitOn)) < RECENT_VISIT_DAYS;
  }
}

const byName = (a: Row, b: Row) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.id.localeCompare(b.id);

/** Stable for paging: every sort ends on name, then id. Never-seen patients and zero balances sort last. */
export function comparePatients(sort: PatientSort) {
  return (a: Row, b: Row): number => {
    if (sort === "last_visit") return (b.lastVisitOn ?? "").localeCompare(a.lastVisitOn ?? "") || byName(a, b);
    if (sort === "balance") return (b.balance ?? 0) - (a.balance ?? 0) || byName(a, b);
    return byName(a, b);
  };
}

/** Search text: lowercased with the accents off ("Niño" is found by "nino"), as `sameText` compares names. */
const plainText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** A phone's digits in the local form: a leading 63 (the country code, +63) reads as 0, so "+63917…" finds "0917…". */
const localDigits = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.startsWith("63") ? `0${d.slice(2)}` : d;
};

/** What a patient is found by (decision 1): the API stores these two strings; the mock builds them per request. */
export function patientSearchText(p: Pick<Patient, "firstName" | "lastName" | "nickname" | "guardians">): { names: string; digits: string } {
  return {
    names: plainText([`${p.firstName} ${p.lastName} ${p.nickname ?? ""}`, ...p.guardians.map((g) => g.fullName)].join(" ")),
    digits: p.guardians.map((g) => localDigits(g.phone)).join(" "),
  };
}

/**
 * A search, as words: each lowercased with the accents off, with its digits (local form) when it reads as a phone
 * number ("0917-123-4567", "+639171234567", "1234567").
 */
export type SearchWord = { text: string; digits?: string };
export function searchWords(q: string): SearchWord[] {
  const isPhone = (w: string) => /^[\d()+-]+$/.test(w) && /\d/.test(w);
  return plainText(q.trim())
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => (isPhone(text) ? { text, digits: localDigits(text) } : { text }));
}

/**
 * Front desk finds a child by the child's or a guardian's name, or a guardian's phone. Every word must match
 * somewhere. Phone digits only match when `phones` is true, so a caller who may not see numbers can't probe them.
 * Moved here unchanged from features/patients/mocks.ts (GET /patients). apps/api runs the same rule in SQL over the
 * stored `patientSearchText` (src/patients/patient-search.ts).
 */
export function matchesSearch(
  p: Pick<Patient, "firstName" | "lastName" | "nickname" | "guardians">,
  q: string,
  { phones }: { phones: boolean },
): boolean {
  const { names, digits } = patientSearchText(p);
  return searchWords(q).every((w) => names.includes(w.text) || (phones && w.digits !== undefined && digits.includes(w.digits)));
}

/** The page `paginate` returns for `total` rows: asking for page 9 of 4 gives page 4, and no rows gives page 1. */
export function pageWindow(total: number, page: number, pageSize: number) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), last);
  return { page: p, offset: (p - 1) * pageSize };
}

/** One page, clamped: asking for page 9 of 4 returns page 4, and an empty list returns page 1. */
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const { page: p, offset } = pageWindow(rows.length, page, pageSize);
  return { rows: rows.slice(offset, offset + pageSize), total: rows.length, page: p, pageSize };
}
