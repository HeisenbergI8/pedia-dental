"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { GrowthRecord, SaveGrowthInput } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const growthKeys = {
  forPatient: (patientId: string) => ["growth", "patient", patientId] as const,
};

/** Oldest first. */
export function useGrowth(patientId: string) {
  return useQuery({
    queryKey: growthKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/growth`, z.array(GrowthRecord)),
  });
}

export function useSaveGrowth(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ visitId, input }: { visitId: string; input: SaveGrowthInput }) =>
      api(`/visits/${visitId}/growth`, GrowthRecord, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: growthKeys.forPatient(patientId) }),
  });
}
