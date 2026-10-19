"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AuditLogPage, type AuditAction } from "@pedia/shared";
import { api } from "@/lib/api-client";

export type AuditFilter = { action?: AuditAction; actorId?: string };
export const auditKeys = { all: ["audit-log"] as const, list: (f: AuditFilter) => [...auditKeys.all, f] as const };

/**
 * B13c2a: the trail, newest first, 50 at a time; `fetchNextPage` loads older. The first cursor-paged list in the web:
 * useInfiniteQuery carries the opaque `next` cursor that a page index can't.
 */
export function useAuditLog(filter: AuditFilter) {
  return useInfiniteQuery({
    queryKey: auditKeys.list(filter),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ limit: "50", ...(filter.action && { action: filter.action }), ...(filter.actorId && { actorId: filter.actorId }), ...(pageParam && { before: pageParam }) });
      return api(`/audit-log?${q}`, AuditLogPage);
    },
    getNextPageParam: (last) => last.next,
    staleTime: 0, // a trail: always the latest when the tab opens
  });
}
