import { addDays, addMonths, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Appointment } from "../schemas/appointment";
import type { DueItem } from "../schemas/recall";

export type FollowUpRule = {
  id: string;
  procedure: string;
  kind: "follow_up" | "recall";
  interval: { days?: number; months?: number };
};

/** Defaults from the clinic's spec. Stored as data so the clinic can edit them. */
export const DEFAULT_FOLLOW_UP_RULES: FollowUpRule[] = [
  { id: "extraction", procedure: "extraction", kind: "follow_up", interval: { days: 7 } },
  { id: "pulpotomy", procedure: "pulpotomy", kind: "follow_up", interval: { days: 14 } },
  { id: "sealant", procedure: "sealant", kind: "recall", interval: { months: 6 } },
  { id: "routine", procedure: "oral_exam", kind: "recall", interval: { months: 6 } },
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

/** On the due list until booked; back on it if that appointment is cancelled or a no-show. */
export function isDueItemOpen(
  item: Pick<DueItem, "appointmentId" | "closedAt">,
  appointments: Pick<Appointment, "id" | "status">[],
): boolean {
  if (item.closedAt) return false;
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
