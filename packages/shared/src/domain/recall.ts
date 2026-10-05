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
  /** Applies only when the signed note's value matches, e.g. caries risk "High". Rules with `when` come first. */
  when?: { field: string; equals: string; label: string };
};

/** Defaults from the clinic's spec. Stored as data so the clinic can edit them. */
export const DEFAULT_FOLLOW_UP_RULES: FollowUpRule[] = [
  { id: "extraction", procedure: "extraction", kind: "follow_up", interval: { days: 7 } },
  { id: "pulpotomy", procedure: "pulpotomy", kind: "follow_up", interval: { days: 14 } },
  // A 6-month recall is met by a completed checkup or cleaning, whether or not it was booked from the recall list.
  { id: "sealant", procedure: "sealant", kind: "recall", interval: { months: 6 }, closedBy: ["oral_exam", "prophylaxis"] },
  // A high caries risk at the exam brings the checkup forward to 3 months (ROADMAP feature 14).
  {
    id: "routine_high_risk",
    procedure: "oral_exam",
    kind: "recall",
    interval: { months: 3 },
    closedBy: ["oral_exam", "prophylaxis"],
    when: { field: "caries_risk", equals: "High", label: "high caries risk" },
  },
  { id: "routine", procedure: "oral_exam", kind: "recall", interval: { months: 6 }, closedBy: ["oral_exam", "prophylaxis"] },
];

/** Returns the due date (YYYY-MM-DD) for a procedure done on `doneOn`. */
export function dueDateFor(rule: FollowUpRule, doneOn: string): string {
  let d = parseISO(doneOn);
  if (rule.interval.months) d = addMonths(d, rule.interval.months);
  if (rule.interval.days) d = addDays(d, rule.interval.days);
  return format(d, "yyyy-MM-dd");
}

/** "Follow-up after extraction" or "6-month recall", worded from the rule. Undefined for an unknown rule id. */
export function ruleLabel(ruleId: string, procedureName: (code: string) => string, rules = DEFAULT_FOLLOW_UP_RULES): string | undefined {
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return undefined;
  if (rule.kind === "follow_up") return `Follow-up after ${procedureName(rule.procedure).toLowerCase()}`;
  return rule.interval.months ? `${rule.interval.months}-month recall` : "Recall";
}

/** The first rule for `procedure` whose condition the note's values meet. Without values, only unconditional rules. */
export function findRule(procedure: string, rules = DEFAULT_FOLLOW_UP_RULES, values?: Record<string, unknown>): FollowUpRule | undefined {
  return rules.find((r) => r.procedure === procedure && (!r.when || (!!values && String(values[r.when.field] ?? "") === r.when.equals)));
}

/** Every rule for a procedure, conditional ones first: what clinic settings lists. */
export const rulesFor = (procedure: string, rules = DEFAULT_FOLLOW_UP_RULES) => rules.filter((r) => r.procedure === procedure);

/** The due item a note for `procedure` done on `doneOn` creates, or undefined when no rule applies. */
export function dueItemFor(procedure: string, doneOn: string, values?: Record<string, unknown>, rules = DEFAULT_FOLLOW_UP_RULES) {
  const rule = findRule(procedure, rules, values);
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
