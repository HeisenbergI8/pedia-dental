import { comparePatients, matchesFilter, paginate, patientStanding, PatientFilter, type DueItem, type Message, type PatientFlags, type PatientListQuery } from "@pedia/shared";
import type { BillTotalsOf } from "../billing-records/billing-records.service";
import { groupBy, type VisitFacts } from "../visits/visit-days.service";

export type Named = { id: string; firstName: string; lastName: string };
export type Standing = Named & { lastVisitOn?: string; recallDueOn?: string; balance: number; flags: PatientFlags };

/**
 * One page of the patient list, its total and the chip counts, for the patients the search matched (B4's SQL), as the
 * mock's list (patients/mocks.ts:114–151, E7). `due` holds open items only; `bills` the live bills' sums (B8 E8).
 * `lastTried`: each patient's last sent or failed text (MessageQueueService.lastTried), all `hasNoContact` reads (B9).
 */
export function standingPage(matched: Named[], facts: VisitFacts, due: DueItem[], bills: BillTotalsOf, lastTried: Pick<Message, "patientId" | "status" | "sendAt">[], query: PatientListQuery, today: string, money: boolean) {
  const seen = groupBy(facts);
  const dueBy = new Map<string, DueItem[]>();
  for (const i of due) dueBy.set(i.patientId, [...(dueBy.get(i.patientId) ?? []), i]);
  const all: Standing[] = matched.map((p) => {
    const mine = seen.get(p.id) ?? { visits: [], done: [] };
    const s = patientStanding(p.id, {
      visits: mine.visits, appointments: mine.done, dueItems: dueBy.get(p.id) ?? [],
      invoices: bills.invoices, payments: bills.payments, messages: lastTried,
    }, today);
    return { ...p, lastVisitOn: s.lastVisitOn, recallDueOn: s.recallDueOn, balance: s.balance, flags: s.flags };
  });
  const counts = Object.fromEntries(PatientFilter.options.map((f) => [f, all.filter((r) => matchesFilter(f, r, today)).length])) as Record<PatientFilter, number>;
  const sort = query.sort === "balance" && !money ? "name" : query.sort; // the mock's leak guard (mocks.ts:144)
  const filtered = all.filter((r) => matchesFilter(query.filter, r, today)).sort(comparePatients(sort));
  return { ...paginate(filtered, query.page, query.pageSize), counts };
}
