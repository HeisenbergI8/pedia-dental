import { z } from "zod";
import { Centavos, ClinicScoped, Id, IsoDateTime } from "./common";
import { isValidTooth } from "../domain/teeth";

export const PlanItemStatus = z.enum(["planned", "in_progress", "done", "declined"]);
export type PlanItemStatus = z.infer<typeof PlanItemStatus>;

/**
 * One planned treatment. An item becomes `done` only when a matching clinical note is signed
 * (see itemsCompletedBy), never by ticking it. Done items feed billing.
 */
export const PlanItem = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  procedureCode: z.string(),
  tooth: z.number().int().refine(isValidTooth, "Invalid FDI tooth").optional(),
  fee: Centavos.nonnegative(),
  status: PlanItemStatus,
  /** The chart finding this item was planned from, if any. */
  sourceChartEntryId: Id.optional(),
  completedVisitId: Id.optional(),
  completedNoteId: Id.optional(),
  createdAt: IsoDateTime,
});
export type PlanItem = z.infer<typeof PlanItem>;

export const AddPlanItemInput = PlanItem.pick({ procedureCode: true, tooth: true, fee: true, sourceChartEntryId: true });
export type AddPlanItemInput = z.infer<typeof AddPlanItemInput>;

/** Staff can start, decline or re-plan an item; `done` comes only from a signed note. */
export const SetPlanItemStatusInput = z.object({ status: PlanItemStatus.exclude(["done"]) });
export type SetPlanItemStatusInput = z.infer<typeof SetPlanItemStatusInput>;
