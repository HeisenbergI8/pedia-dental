"use client";
import { SearchXIcon } from "lucide-react";
import { PENDING_REVIEW } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ApiError } from "@/lib/api-client";
import { SignupFrame } from "@/features/signup/components/signup-frame";
import { formatDate } from "@/lib/format";
import { usePublicNotice } from "../api";

/** Privacy #3, #19, #22: a clinic's notice in force, its version, and its privacy contact. Readable before sign-in. */
export function ClinicNotice({ clinicId }: { clinicId: string }) {
  const notice = usePublicNotice(clinicId);
  const n = notice.data;
  const missing = notice.error instanceof ApiError && notice.error.status === 404;
  return (
    <SignupFrame>
      {notice.isLoading && <Loading label="Loading the privacy notice" />}
      {missing && <EmptyState icon={SearchXIcon} title="We can't find that clinic's privacy notice">Check the link the clinic gave you.</EmptyState>}
      {notice.error && !missing && <ErrorState what="the privacy notice" onRetry={() => void notice.refetch()} />}
      {n && (
        <article className="space-y-5">
          <header className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{n.clinicName} privacy notice</h1>
            <p className="text-sm text-ink-muted">
              Version {n.version} · {formatDate(n.at.slice(0, 10))} · {n.version === 1 ? "from Primolar's template" : `edited by ${n.clinicName}`} ({PENDING_REVIEW.toLowerCase()})
            </p>
          </header>
          {n.body.split(/\n{2,}/).map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
          <p className="rounded-xl border border-line bg-surface p-4 text-sm">
            Privacy contact: <span className="font-semibold">{n.contactName}</span>,{" "}
            <a href={`mailto:${n.contactEmail}`} className="font-semibold text-brand underline underline-offset-2">
              {n.contactEmail}
            </a>
          </p>
        </article>
      )}
    </SignupFrame>
  );
}
