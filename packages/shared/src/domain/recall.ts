import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Appointment } from "../schemas/appointment";
import type { DueItem } from "../schemas/recall";

export type FollowUpRule = {
  id: string;
  procedure: string;
  kind: "follow_up" | "recall";
  interval: { days?: number; months?: number };
  /** Procedures that, once done, close an open item for this rule: the child was seen for it. */
  closedBy?: string[];
};

/** Defaults from the clinic's spec. Stored as data so the clinic can edit them. */
export const DEFAULT_FOLLOW_UP_RULES: FollowUpRule[] = [
  { id: "extraction", procedure: "extraction", kind: "follow_up", interval: { days: 7 } },
  { id: "pulpotomy", procedure: "pulpotomy", kind: "follow_up", interval: { days: 14 } },
  // A 6-month recall is met by a completed checkup or cleaning, whether or not it was booked from the recall list.
  { id: "sealant", procedure: "sealant", kind: "recall", interval: { months: 6 }, closedBy: ["oral_exam", "prophylaxis"] },
  { id: "routine", procedure: "oral_exam", kind: "recall", interval: { months: 6 }, closedBy: ["oral_exam", "prophylaxis"] },
];

/** Returns the due date (YYYY-MM-DD) for a procedure done on `doneOn`. */
export function dueDateFor(rule: FollowUpRule, doneOn: string): string {
  let d = parseISO(doneOn);
  if (rule.interval.months) d = addMonths(d, rule.interval.months);
  if (rule.interval.days) d = addDays(d, rule.interval.days);
  return format(d, "yyyy-MM-dd");
}

export function findRule(procedure: string, rules = DEFAULT_FOLLOW_UP_RULES): FollowUpRule | undefined {
  return rules.find((r) => r.procedure === procedure);
}

/** The due item a note for `procedure` done on `doneOn` creates, or undefined when no rule applies. */
export function dueItemFor(procedure: string, doneOn: string, rules = DEFAULT_FOLLOW_UP_RULES) {
  const rule = findRule(procedure, rules);
  return rule && { ruleId: rule.id, kind: rule.kind, procedure, dueOn: dueDateFor(rule, doneOn) };
}

/**
 * On the due list until booked; back on it if that appointment is cancelled or a no-show. Also off the list once
 * the child has a completed appointment for one of the rule's `closedBy` procedures after the item was created.
 */
export function isDueItemOpen(
  item: Pick<DueItem, "appointmentId" | "closedAt"> & Partial<Pick<DueItem, "patientId" | "ruleId" | "createdAt">>,
  appointments: (Pick<Appointment, "id" | "status"> & Partial<Pick<Appointment, "patientId" | "procedureCode" | "startsAt">>)[],
  rules = DEFAULT_FOLLOW_UP_RULES,
): boolean {
  if (item.closedAt) return false;
  const closedBy = rules.find((r) => r.id === item.ruleId)?.closedBy ?? [];
  const seen = appointments.some(
    (a) =>
      a.status === "done" &&
      a.patientId === item.patientId &&
      !!a.procedureCode &&
      closedBy.includes(a.procedureCode) &&
      !!a.startsAt &&
      !!item.createdAt &&
      a.startsAt > item.createdAt,
  );
  if (seen) return false;
  if (!item.appointmentId) return true;
  const booked = appointments.find((a) => a.id === item.appointmentId);
  return !booked || booked.status === "cancelled" || booked.status === "no_show";
}

export type DueBucket = "overdue" | "this_week" | "this_month";

/** Rolling windows from `today` (YYYY-MM-DD). Undefined for items more than 30 days out. */
export function dueBucket(dueOn: string, today: string): DueBucket | undefined {
  const days = differenceInCalendarDays(parseISO(dueOn), parseISO(today));
  if (days < 0) return "overdue";
  if (days <= 7) return "this_week";
  if (days <= 30) return "this_month";
  return undefined;
}
