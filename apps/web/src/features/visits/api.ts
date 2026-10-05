"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { StartVisitInput, Visit } from "@pedia/shared";
import { appointmentKeys } from "@/features/appointments/api";
import { patientKeys } from "@/features/patients/api";
import { api } from "@/lib/api-client";

export const visitKeys = {
  forPatient: (patientId: string) => ["visits", "patient", patientId] as const,
};

/** Newest first. */
export function useVisits(patientId: string) {
  return useQuery({
    queryKey: visitKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/visits`, z.array(Visit)),
    enabled: !!patientId, // the booking form asks before a patient is picked
  });
}

/** The visit new chart entries, notes and payments attach to, if one is open. */
export function useCurrentVisit(patientId: string) {
  const { data } = useVisits(patientId);
  return data?.find((v) => v.status === "in_progress");
}

/** Starting and finishing a visit moves its appointment to in chair and done. */
function useInvalidateVisits(patientId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: visitKeys.forPatient(patientId) }),
      qc.invalidateQueries({ queryKey: appointmentKeys.all }),
      qc.invalidateQueries({ queryKey: patientKeys.summaries }), // the header's "last visit"
    ]);
}

export function useStartVisit(patientId: string) {
  const invalidate = useInvalidateVisits(patientId);
  return useMutation({
    mutationFn: (input: StartVisitInput) =>
      api(`/patients/${patientId}/visits`, Visit, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: invalidate,
  });
}

export function useCompleteVisit(patientId: string) {
  const invalidate = useInvalidateVisits(patientId);
  return useMutation({
    mutationFn: (visitId: string) => api(`/visits/${visitId}/complete`, Visit, { method: "POST" }),
    onSuccess: invalidate,
  });
}
