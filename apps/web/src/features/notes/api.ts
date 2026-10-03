"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ClinicalNote, CreateNoteInput, NoteTemplate, UpdateNoteInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { planKeys } from "@/features/plan/api";
import { dueKeys } from "@/features/recalls/api";
import { messageKeys } from "@/features/messages/api";

export const noteKeys = {
  forPatient: (patientId: string) => ["notes", "patient", patientId] as const,
};

export function useNoteTemplates() {
  return useQuery({
    queryKey: ["note-templates"],
    queryFn: () => api("/note-templates", z.array(NoteTemplate)),
    staleTime: Infinity,
  });
}

/** Newest first. */
export function useNotes(patientId: string) {
  return useQuery({
    queryKey: noteKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/notes`, z.array(ClinicalNote)),
  });
}

/** Creates a draft, or saves changes to an existing draft when `noteId` is given. */
export function useSaveNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, input }: { noteId?: string; input: CreateNoteInput | UpdateNoteInput }) =>
      noteId
        ? api(`/notes/${noteId}`, ClinicalNote, { method: "PUT", body: JSON.stringify(input) })
        : api(`/patients/${patientId}/notes`, ClinicalNote, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.forPatient(patientId) }),
  });
}

export function useSignNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) => api(`/notes/${noteId}/sign`, ClinicalNote, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.forPatient(patientId) });
      qc.invalidateQueries({ queryKey: planKeys.forPatient(patientId) }); // signing completes plan items
      qc.invalidateQueries({ queryKey: dueKeys.all }); // and can make a follow-up or recall due
      qc.invalidateQueries({ queryKey: messageKeys.all }); // and queues care instructions
    },
  });
}
