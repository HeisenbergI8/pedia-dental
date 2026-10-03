"use client";
import { useQuery } from "@tanstack/react-query";
import { FinanceSummary } from "@pedia/shared";
import { api } from "@/lib/api-client";

/** The admin dashboard's numbers for `today` (YYYY-MM-DD). Recomputed by the server on every fetch. */
export function useFinanceSummary(today: string, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", "finance", today],
    queryFn: () => api(`/reports/finance?today=${today}`, FinanceSummary),
    enabled,
    staleTime: 0, // refetch on every visit, so a payment just recorded on /billing shows here at once
  });
}
