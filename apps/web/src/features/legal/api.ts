"use client";
import { useQuery } from "@tanstack/react-query";
import { PrivacyNoticeView } from "@pedia/shared";
import { ApiError, api } from "@/lib/api-client";

/** Privacy #3: a clinic's notice, public. No session involved, so no clinic or operator key prefix. */
export const usePublicNotice = (clinicId: string) =>
  useQuery({
    queryKey: ["legal", "notice", clinicId],
    queryFn: () => api(`/legal/notices/${encodeURIComponent(clinicId)}`, PrivacyNoticeView),
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 3, // an unknown clinic stays unknown
  });
