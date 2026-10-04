"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FinanceSummary, Message, TodaySummary } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { appointmentKeys } from "@/features/appointments/api";
import { messageKeys } from "@/features/messages/api";

/** The admin dashboard's numbers for `today` (YYYY-MM-DD). Recomputed by the server on every fetch. */
export function useFinanceSummary(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "finance", today],
    queryFn: () => api(`/reports/finance?today=${today}`, FinanceSummary),
    enabled,
    staleTime: 0, // refetch on every visit, so a payment just recorded on /billing shows here at once
  });
}

/**
 * Under appointmentKeys.all, so every booking, status change and reschedule marks it stale. No refresh
 * button: staleTime 0 refetches on every visit and window focus.
 */
export const todayKey = (today: string) => [...appointmentKeys.all, "today", today] as const;

export function useTodaySummary(today: string) {
  return useQuery({ queryKey: todayKey(today), queryFn: () => api(`/reports/today?today=${today}`, TodaySummary), staleTime: 0 });
}

export function useSendBirthdayGreeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patientId: string) => api(`/patients/${patientId}/birthday-greeting`, Message, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...appointmentKeys.all, "today"] });
      qc.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}
