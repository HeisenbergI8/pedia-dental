// B13c1–B14: the list as the shared rules compute it over every match: the oracle the SQL list (B14) is held to.
import { comparePatients, matchesFilter, paginate, patientStanding, PatientFilter, type DueItem, type Message, type PatientFlags, type PatientListQuery } from "@pedia/shared";
import type { BillTotalsOf } from "../../../src/billing-records/billing-records.service";
import { groupBy, type VisitFacts } from "../../../src/visits/visit-days.service";

export type Named = { id: string; firstName: string; lastName: string };
export type Standing = Named & { lastVisitOn?: string; recallDueOn?: string; balance: number; flags: PatientFlags };

/**
 * One page of the patient list, its total and the chip counts, for the patients the search matched (B4's SQL), as the
 * mock's list (patients/mocks.ts:114–151, E7). `due` holds open items only; `bills` the live bills' sums (B8 E8).
 * `lastTried`: each patient's last sent or failed text (MessageQueueService.lastTried), all `hasNoContact` reads (B9).
 */
export function standingPage(matched: Named[], facts: VisitFacts, due: DueItem[], bills: BillTotalsOf, lastTried: Pick<Message, "patientId" | "status" | "sendAt">[], query: PatientListQuery, today: string, money: boolean) {
  const seen = groupBy(facts);
  // B13c1 load test: each patient gets only its own rows. patientStanding filters by patient (and payments by invoice)
  // anyway, so the answer is the same; passing every row to every patient was O(patients × rows), ~1 s at 5,000 patients.
  const dueBy = byKey(due, (i) => i.patientId);
  const invoicesBy = byKey(bills.invoices, (i) => i.patientId);
  const ownerOfInvoice = new Map(bills.invoices.map((i) => [i.id, i.patientId]));
  const paymentsBy = byKey(bills.payments, (p) => (p.invoiceId ? ownerOfInvoice.get(p.invoiceId) : undefined));
  const triedBy = byKey(lastTried, (m) => m.patientId);
  const all: Standing[] = matched.map((p) => {
    const mine = seen.get(p.id) ?? { visits: [], done: [] };
    const s = patientStanding(p.id, {
      visits: mine.visits, appointments: mine.done, dueItems: dueBy.get(p.id) ?? [],
      invoices: invoicesBy.get(p.id) ?? [], payments: paymentsBy.get(p.id) ?? [], messages: triedBy.get(p.id) ?? [],
    }, today);
    return { ...p, lastVisitOn: s.lastVisitOn, recallDueOn: s.recallDueOn, balance: s.balance, flags: s.flags };
  });
  const counts = Object.fromEntries(PatientFilter.options.map((f) => [f, all.filter((r) => matchesFilter(f, r, today)).length])) as Record<PatientFilter, number>;
  const sort = query.sort === "balance" && !money ? "name" : query.sort; // the mock's leak guard (mocks.ts:144)
  const filtered = all.filter((r) => matchesFilter(query.filter, r, today)).sort(comparePatients(sort));
  return { ...paginate(filtered, query.page, query.pageSize), counts };
}

/** Rows by a key; a row whose key is undefined is left out. */
function byKey<T>(rows: readonly T[], key: (row: T) => string | undefined): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === undefined) continue;
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
