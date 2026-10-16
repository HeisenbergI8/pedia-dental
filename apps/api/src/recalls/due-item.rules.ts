import { dueItemFor, isDueItemOpen, type Appointment, type DueItem } from "@pedia/shared";

type Item = Pick<DueItem, "id" | "patientId" | "ruleId" | "procedure" | "dueOn" | "appointmentId" | "closedAt" | "createdAt">;
type Appt = Pick<Appointment, "id" | "status" | "patientId" | "procedureCode" | "startsAt">;
type New = Pick<DueItem, "ruleId" | "kind" | "procedure" | "dueOn">;

/**
 * What signing a note does to the patient's due items (notes/mocks.ts:83–97): when a rule applies, close every open
 * item for the same procedure (any rule: a high-risk exam replaces the 6-month recall, and back) and open the new one.
 * No rule → no change. `visitDate` is the note's visit's day (the procedure was done then, not when signed).
 */
export function signChange(procedure: string, visitDate: string, values: Record<string, unknown>, items: Item[]): { close: string[]; open?: New } {
  const open = dueItemFor(procedure, visitDate, values);
  if (!open) return { close: [] };
  return { close: items.filter((i) => i.procedure === procedure && !i.closedAt).map((i) => i.id), open };
}

/** The item a booking from the due list takes (appointments/mocks.ts:86–91): the earliest open one for the rule. */
export function bookedItem(patientId: string, ruleId: string, items: Item[], appointments: Appt[]): Item | undefined {
  return items
    .filter((i) => i.patientId === patientId && i.ruleId === ruleId && isDueItemOpen(i, appointments))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))[0];
}

export type SignedNote = { id: string; patientId: string; visitId: string; procedure: string; visitDate: string; values: Record<string, unknown>; signedAt: string };

/**
 * The backfill (E8): per (patient, procedure), the latest signed note that a rule applies to. When no item came from it,
 * close that group's open items at its signedAt and create `due_<noteId>` (the seed's id rule, seed.ts:514).
 * Idempotent: a group whose latest note already has its item gives nothing.
 */
export function dueBackfill(notes: SignedNote[], items: Pick<Item, "id" | "patientId" | "procedure" | "closedAt">[], hasItem: (noteId: string) => boolean) {
  const latest = new Map<string, SignedNote>();
  for (const n of [...notes].sort((a, b) => a.signedAt.localeCompare(b.signedAt) || a.id.localeCompare(b.id))) {
    if (dueItemFor(n.procedure, n.visitDate, n.values)) latest.set(`${n.patientId}:${n.procedure}`, n);
  }
  return [...latest.values()].filter((n) => !hasItem(n.id)).map((n) => ({
    note: n,
    close: items.filter((i) => i.patientId === n.patientId && i.procedure === n.procedure && !i.closedAt).map((i) => i.id),
    create: { ...dueItemFor(n.procedure, n.visitDate, n.values)!, id: `due_${n.id}`, patientId: n.patientId, sourceNoteId: n.id, visitId: n.visitId, createdAt: n.signedAt },
  }));
}
