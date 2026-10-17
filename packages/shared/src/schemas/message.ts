import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";
import { unknownPlaceholders } from "../domain/messages";

/** The parent messages from feature 5. A template's kind is also its key: one template per kind. */
export const MessageKind = z.enum([
  "appointment_confirmation",
  "appointment_reminder",
  "post_extraction",
  "post_pulpotomy",
  "fluoride_instructions",
  "pre_treatment",
  "missed_appointment",
  "follow_up_reminder",
  "recall",
  "birthday",
]);
export type MessageKind = z.infer<typeof MessageKind>;

/** 480 characters is three SMS segments: the most a reminder should cost. */
const TemplateBody = z
  .string()
  .trim()
  .min(1, "Write the message")
  .max(480, "Keep it to 480 characters (3 text messages)")
  .superRefine((body, ctx) => {
    const unknown = unknownPlaceholders(body);
    if (unknown.length) {
      ctx.addIssue({
        code: "custom",
        message: `${unknown.map((p) => `{${p}}`).join(", ")} isn't a placeholder. Pick one from the list.`,
      });
    }
  });

export const MessageTemplate = ClinicScoped.extend({
  kind: MessageKind,
  name: z.string(),
  body: TemplateBody,
  updatedAt: IsoDateTime,
});
export type MessageTemplate = z.infer<typeof MessageTemplate>;

export const UpdateMessageTemplateInput = MessageTemplate.pick({ body: true });
export type UpdateMessageTemplateInput = z.infer<typeof UpdateMessageTemplateInput>;

/** `cancelled`: withdrawn before sending because its appointment was cancelled or moved. */
export const MessageStatus = z.enum(["queued", "sent", "failed", "cancelled"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

/** SMS only (B9 decision 1): Semaphore on the API, nothing sent in the demo. */
export const MessageChannel = z.enum(["sms"]);

/** One text to a guardian. The demo queues and logs it; the API sends it through its outbox (B9). */
export const Message = ClinicScoped.extend({
  id: Id,
  patientId: Id,
  kind: MessageKind,
  channel: MessageChannel,
  to: z.string(), // the primary guardian's phone
  recipientName: z.string(),
  body: z.string(), // rendered when queued, so a later template edit doesn't rewrite the log
  status: MessageStatus,
  sendAt: IsoDateTime,
  appointmentId: Id.optional(),
  noteId: Id.optional(),
  dueItemId: Id.optional(),
  failureReason: z.string().optional(),
  createdAt: IsoDateTime,
});
export type Message = z.infer<typeof Message>;
