"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ChartEntry, CreateChartEntryInput, type CreateChartBatchInput } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const chartKeys = {
  forPatient: (patientId: string) => ["chart", "patient", patientId] as const,
};

/** Every entry, oldest first. Derive the current chart with `deriveChart()`. */
export function useChartEntries(patientId: string) {
  return useQuery({
    queryKey: chartKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/chart`, z.array(ChartEntry)),
  });
}

/** Appends a finding, or a correction when `supersedes` is set. Entries are never edited. */
export function useRecordChartEntry(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChartEntryInput) =>
      api(`/patients/${patientId}/chart`, ChartEntry, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chartKeys.forPatient(patientId) }),
  });
}

/** One finding on several teeth: one entry each, all or none. */
export function useRecordChartBatch(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChartBatchInput) =>
      api(`/patients/${patientId}/chart/batch`, z.array(ChartEntry), { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chartKeys.forPatient(patientId) }),
  });
}
