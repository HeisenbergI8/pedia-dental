import { addDays, addMonths, format, parseISO } from "date-fns";

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
