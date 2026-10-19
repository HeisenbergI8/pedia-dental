"use client";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PrivacyRequest, PrivacyRequestPage, type ClosePrivacyRequestInput, type LogPrivacyRequestInput, type PrivacyRequestKind } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { auditKeys } from "@/features/audit/api";
import { patientKeys } from "@/features/patients/api";

export const privacyRequestKeys = { all: ["privacy-requests"] as const, open: ["privacy-requests", "open"] as const, closed: ["privacy-requests", "closed"] as const };

/** The kind as the clinic says it (E2). */
export const KIND_LABEL: Record<PrivacyRequestKind, string> = {
  access: "Copy of records", correction: "Correction", erasure: "Erasure", objection: "Objection", other: "Other",
};

/** B13c2b: every open request, soonest due first (E4). */
export const useOpenPrivacyRequests = () =>
  useQuery({ queryKey: privacyRequestKeys.open, queryFn: () => api("/privacy-requests?status=open", PrivacyRequestPage) });

/** Closed requests, newest closed first, 50 at a time: B13c2a's useAuditLog shape. */
export const useClosedPrivacyRequests = () =>
  useInfiniteQuery({
    queryKey: privacyRequestKeys.closed,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api(`/privacy-requests?${new URLSearchParams({ status: "closed", limit: "50", ...(pageParam && { before: pageParam }) })}`, PrivacyRequestPage),
    getNextPageParam: (last) => last.next,
  });

export function useLogPrivacyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogPrivacyRequestInput) => api("/privacy-requests", PrivacyRequest, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => Promise.all([privacyRequestKeys.all, auditKeys.all].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}

/** Closing an erasure as done restricts the child: the patient's caches and the trail change too. */
export function useClosePrivacyRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ClosePrivacyRequestInput) => api(`/privacy-requests/${id}/close`, PrivacyRequest, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => Promise.all([privacyRequestKeys.all, patientKeys.all, auditKeys.all].map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
}
