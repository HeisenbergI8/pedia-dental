import { Message } from "@pedia/shared";
import type { Prisma } from "../generated/prisma/client.ts";

/** The outbox kind that sends one text; payload `{ messageId }` (E2). */
export const MESSAGE_SEND = "message.send";

/** The contract's columns only: dispatchedAt, sentAt, segments, providerRef and greetingYear never reach a response. */
export const MESSAGE_COLUMNS = {
  id: true, clinicId: true, patientId: true, kind: true, channel: true, to: true, recipientName: true, body: true,
  status: true, sendAt: true, appointmentId: true, noteId: true, dueItemId: true, failureReason: true, createdAt: true,
} as const satisfies Prisma.MessageSelect;
export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_COLUMNS }>;

/** Row → contract. Nulls become absent keys, as the mock's records have them. */
export function toMessage(r: MessageRow): Message {
  return Message.parse({
    ...r,
    sendAt: r.sendAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    appointmentId: r.appointmentId ?? undefined,
    noteId: r.noteId ?? undefined,
    dueItemId: r.dueItemId ?? undefined,
    failureReason: r.failureReason ?? undefined,
  });
}

/** The internal columns a new row may start with: a birthday's year (E9); a seeded `sent` row's outcome (E10). */
type Internal = Pick<Prisma.MessageUncheckedCreateInput, "greetingYear" | "sentAt" | "dispatchedAt" | "segments">;

/** Contract → row data for a new message (the seed and the queue). */
export function messageData(m: Message, extra: Internal = {}): Prisma.MessageUncheckedCreateInput {
  return {
    id: m.id, clinicId: m.clinicId, patientId: m.patientId, kind: m.kind, channel: m.channel, to: m.to,
    recipientName: m.recipientName, body: m.body, status: m.status, sendAt: new Date(m.sendAt),
    appointmentId: m.appointmentId ?? null, noteId: m.noteId ?? null, dueItemId: m.dueItemId ?? null,
    failureReason: m.failureReason ?? null, createdAt: new Date(m.createdAt), greetingYear: null, ...extra,
  };
}
