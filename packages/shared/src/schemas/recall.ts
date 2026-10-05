import { z } from "zod";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";

/**
 * A follow-up or recall that fell due because a note was signed (see dueItemFor). It leaves the due
 * list once booked, and comes back if that appointment is cancelled or missed (see isDueItemOpen).
 */
export const DueItem = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  ruleId: Id, // a FollowUpRule.id; an appointment booked from this item carries it as sourceRuleId
  kind: z.enum(["follow_up", "recall"]), // mirrors FollowUpRule["kind"]
  procedure: z.string(), // the Procedure.code that was done
  dueOn: IsoDate,
  sourceNoteId: Id,
  appointmentId: Id.optional(), // set when booked
  closedAt: IsoDateTime.optional(), // set when a newer item for the same patient and rule replaces it
  createdAt: IsoDateTime,
  /** The dentist of the visit whose note made this due. Derived on read for booking, never stored. */
  dentistId: Id.optional(),
});
export type DueItem = z.infer<typeof DueItem>;
