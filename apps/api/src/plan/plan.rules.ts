import type { AddPlanItemInput, PlanItem, Procedure } from "@pedia/shared";
import type { Refusal } from "../common/refusal";

export const PLAN_ITEM_NOT_FOUND = "Plan item not found"; // plan/mocks.ts:43

/** POST /patients/:id/plan after the patient was found and the body parsed (plan/mocks.ts:24–28). */
export function addRefusal(procedure: Pick<Procedure, "name" | "perTooth"> | undefined, input: AddPlanItemInput): Refusal | undefined {
  if (!procedure) return { status: 400, message: "Unknown procedure" };
  if (procedure.perTooth && input.tooth === undefined) return { status: 400, message: `${procedure.name} is planned per tooth` };
  return undefined;
}

/** PATCH /plan-items/:id: a done item never changes (plan/mocks.ts:44). Checked before the body, as the mock. */
export const statusRefusal = (item: Pick<PlanItem, "status">): Refusal | undefined =>
  item.status === "done" ? { status: 409, message: "A completed item can't change" } : undefined;
