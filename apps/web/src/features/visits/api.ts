"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { StartVisitInput, Visit } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const visitKeys = {
  forPatient: (patientId: string) => ["visits", "patient", patientId] as const,
};

/** Newest first. */
export function useVisits(patientId: string) {
  return useQuery({
    queryKey: visitKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/visits`, z.array(Visit)),
  });
}

/** The visit new chart entries, notes and payments attach to, if one is open. */
export function useCurrentVisit(patientId: string) {
  const { data } = useVisits(patientId);
  return data?.find((v) => v.status === "in_progress");
}

export function useStartVisit(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartVisitInput) =>
      api(`/patients/${patientId}/visits`, Visit, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: visitKeys.forPatient(patientId) }),
  });
}

export function useCompleteVisit(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) => api(`/visits/${visitId}/complete`, Visit, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: visitKeys.forPatient(patientId) }),
  });
}
