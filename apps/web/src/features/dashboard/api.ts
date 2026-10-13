"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ALL_BRANCHES, FinanceSummary, Message, TodaySummary, reportBranchFilter } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { appointmentKeys } from "@/features/appointments/api";
import { useSession } from "@/features/auth/access";
import { useClinic } from "@/features/clinic/api";
import { messageKeys } from "@/features/messages/api";

/** `&branch=…` for a report, or nothing for the device's branch (the server's default). */
export const branchParam = (branch: string | undefined) => (branch ? `&branch=${encodeURIComponent(branch)}` : "");

/**
 * The branch filter's state for one screen (decision #20). `filter` undefined = no filter shown (Small, or one
 * branch). `branch` is what to send: undefined while the device's branch is chosen. A choice that stops being valid
 * (the device switched branch, a branch was archived) falls back to the device's branch.
 */
export function useReportBranch() {
  const { data } = useClinic();
  const roles = useSession()?.user.roles ?? [];
  const filter = data ? reportBranchFilter(data.account.tier, roles, data.branches) : undefined;
  const [chosen, setChosen] = useState<string | undefined>();
  const valid = !!filter && !!chosen && (chosen === ALL_BRANCHES ? filter.all : filter.branches.some((b) => b.id === chosen));
  const value = valid ? chosen! : data?.activeBranchId;
  return { filter, value, branch: value === data?.activeBranchId ? undefined : value, choose: setChosen };
}

/** The admin dashboard's numbers for `today` (YYYY-MM-DD). Recomputed by the server on every fetch. */
export function useFinanceSummary(today: string, enabled: boolean, branch?: string) {
  return useQuery({
    queryKey: ["reports", "finance", today, branch ?? "device"],
    queryFn: () => api(`/reports/finance?today=${today}${branchParam(branch)}`, FinanceSummary),
    enabled,
    staleTime: 0, // refetch on every visit, so a payment just recorded on /billing shows here at once
  });
}

/**
 * Under appointmentKeys.all, so every booking, status change and reschedule marks it stale. No refresh
 * button: staleTime 0 refetches on every visit and window focus.
 */
export const todayKey = (today: string, branch?: string) => [...appointmentKeys.all, "today", today, branch ?? "device"] as const;

export function useTodaySummary(today: string, branch?: string) {
  return useQuery({
    queryKey: todayKey(today, branch),
    queryFn: () => api(`/reports/today?today=${today}${branchParam(branch)}`, TodaySummary),
    staleTime: 0,
  });
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
