"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Message, MessageTemplate, type MessageKind, type MessageStatus, type UpdateMessageTemplateInput } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const messageKeys = { all: ["messages"] as const, templates: ["message-templates"] as const };

export const KIND_LABEL: Record<MessageKind, string> = {
  appointment_confirmation: "Appointment confirmation",
  appointment_reminder: "Appointment reminder",
  post_extraction: "Post-extraction instructions",
  post_pulpotomy: "Post-pulpotomy instructions",
  fluoride_instructions: "Fluoride instructions",
  pre_treatment: "Pre-treatment instructions",
  missed_appointment: "Missed appointment",
  follow_up_reminder: "Follow-up reminder",
  recall: "Recall",
  birthday: "Birthday greeting",
};

export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = { queued: "Queued", sent: "Sent", failed: "Failed", cancelled: "Withdrawn" };

/** The whole log, newest first. Filtering by status is done on screen so the counts stay right. */
export function useMessages() {
  return useQuery({ queryKey: messageKeys.all, queryFn: () => api("/messages", z.array(Message)) });
}

export function useMessageTemplates() {
  return useQuery({ queryKey: messageKeys.templates, queryFn: () => api("/message-templates", z.array(MessageTemplate)) });
}

export function useUpdateMessageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, ...input }: UpdateMessageTemplateInput & { kind: MessageKind }) =>
      api(`/message-templates/${kind}`, MessageTemplate, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: messageKeys.templates }),
  });
}

/** Queues the follow-up or recall message for one due item. */
export function useQueueDueMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dueItemId: string) => api(`/due-items/${dueItemId}/message`, Message, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: messageKeys.all }),
  });
}
