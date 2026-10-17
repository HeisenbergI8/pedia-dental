import { differenceInCalendarDays, format, parseISO } from "date-fns";
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

/** "Recent visit": seen within this many days, today included. Data, not an `if` (CONVENTIONS, Domain rules). */
export const RECENT_VISIT_DAYS = 30;
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
/** An account text (an invite, a reset: B11) goes to one guardian about their login, so it never decides "no contact". */
export function hasNoContact(
  patientId: string,
  messages: (Pick<Message, "patientId" | "status" | "sendAt"> & { kind?: Message["kind"] })[],
): boolean {
  const tried = messages
    .filter((m) => m.patientId === patientId && !isAccountText(m.kind) && (m.status === "sent" || m.status === "failed"))
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
  messages: Pick<Message, "patientId" | "status" | "sendAt">[];
};

/** Everything the list shows about one patient, from the same sources as /recall and the dashboard. */
export function patientStanding(patientId: string, facts: PatientFacts, today: string) {
  const balance = accountSummary(facts.invoices.filter((i) => i.patientId === patientId), facts.payments).balance;
  const due = recallDueOn(patientId, facts.dueItems, facts.appointments, today);
  const flags: PatientFlags = { recallDue: !!due, balanceDue: balance > 0, noContact: hasNoContact(patientId, facts.messages) };
  return { balance, recallDueOn: due, lastVisitOn: lastVisitOn(patientId, facts.visits, facts.appointments), flags };
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

/** What a patient is found by (decision 1): the API stores these two strings; the mock builds them per request. */
export function patientSearchText(p: Pick<Patient, "firstName" | "lastName" | "nickname" | "guardians">): { names: string; digits: string } {
  return {
    names: [`${p.firstName} ${p.lastName} ${p.nickname ?? ""}`, ...p.guardians.map((g) => g.fullName)].join(" ").toLowerCase(),
    digits: p.guardians.map((g) => g.phone.replace(/\D/g, "")).join(" "),
  };
}

/** A search, as words: each lowercased, with its digits when it reads as a phone number ("0917-123-4567", "1234567"). */
export type SearchWord = { text: string; digits?: string };
export function searchWords(q: string): SearchWord[] {
  const isPhone = (w: string) => /^[\d()+-]+$/.test(w) && /\d/.test(w);
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => (isPhone(text) ? { text, digits: text.replace(/\D/g, "") } : { text }));
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
