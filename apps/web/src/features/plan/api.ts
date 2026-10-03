"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AddPlanItemInput, PlanItem, type PlanItemStatus, type SetPlanItemStatusInput } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const PLAN_STATUS_LABEL: Record<PlanItemStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  declined: "Declined",
};

export const planKeys = {
  forPatient: (patientId: string) => ["plan", "patient", patientId] as const,
};

/** Oldest first, in the order the plan was written. */
export function usePlan(patientId: string) {
  return useQuery({
    queryKey: planKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/plan`, z.array(PlanItem)),
  });
}

export function useAddPlanItem(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddPlanItemInput) =>
      api(`/patients/${patientId}/plan`, PlanItem, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: planKeys.forPatient(patientId) }),
  });
}

export function useSetPlanItemStatus(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string } & SetPlanItemStatusInput) =>
      api(`/plan-items/${id}`, PlanItem, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: planKeys.forPatient(patientId) }),
  });
}
