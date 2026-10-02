import type { PlanItem } from "../schemas/plan";
import type { ToothNumber } from "./teeth";

const isOpen = (i: PlanItem) => i.status === "planned" || i.status === "in_progress";

/**
 * The open plan items a signed note for `procedure` on `teeth` completes: one item per tooth treated,
 * or, when no item names those teeth, the oldest open item for the procedure with no tooth.
 */
export function itemsCompletedBy(procedure: string, teeth: ToothNumber[], items: PlanItem[]): PlanItem[] {
  const open = items
    .filter((i) => isOpen(i) && i.procedureCode === procedure)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const perTooth = teeth.flatMap((t) => open.find((i) => i.tooth === t) ?? []);
  if (perTooth.length) return perTooth;
  return open.filter((i) => i.tooth === undefined).slice(0, 1);
}

/** Declined items don't count toward progress. */
export function planProgress(items: PlanItem[]) {
  const counted = items.filter((i) => i.status !== "declined");
  return { done: counted.filter((i) => i.status === "done").length, total: counted.length };
}
