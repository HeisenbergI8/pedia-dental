import type { AddPlanItemInput, PlanItem, Procedure } from "@pedia/shared";
import type { Refusal } from "../common/refusal";

export const PLAN_ITEM_NOT_FOUND = "Plan item not found"; // plan/mocks.ts:43

/** POST /patients/:id/plan after the patient was found and the body parsed (plan/mocks.ts:24–28). */
export function addRefusal(procedure: Pick<Procedure, "name" | "perTooth"> | undefined, input: AddPlanItemInput): Refusal | undefined {
  if (!procedure) return { status: 400, message: "Unknown procedure" };
  if (procedure.perTooth && input.tooth === undefined) return { status: 400, message: `${procedure.name} is planned per tooth` };
  return undefined;
}

/**
 * An item made from a chart finding (#28): the finding is this child's, on the item's tooth, and the same procedure for
 * it isn't on the plan already (planned or in progress; a declined or done one can be planned again). One finding may
 * still lead to two procedures, e.g. a pulpotomy then a restoration. `finding`: the entry by id, in this clinic.
 * `openAlready`: the procedure's name when an open item for this finding and procedure exists.
 */
export function findingRefusal(
  finding: { patientId: string; tooth: number } | undefined,
  patientId: string,
  input: Pick<AddPlanItemInput, "tooth">,
  openAlready: string | undefined,
): Refusal | undefined {
  if (!finding || finding.patientId !== patientId) return { status: 400, message: "Unknown chart finding" };
  if (input.tooth !== undefined && input.tooth !== finding.tooth) return { status: 400, message: `This finding is on tooth ${finding.tooth}` };
  if (openAlready) return { status: 409, message: `${openAlready} for this finding is already on the plan` };
  return undefined;
}

/** PATCH /plan-items/:id: a done item never changes (plan/mocks.ts:44). Checked before the body, as the mock. */
export const statusRefusal = (item: Pick<PlanItem, "status">): Refusal | undefined =>
  item.status === "done" ? { status: 409, message: "A completed item can't change" } : undefined;
