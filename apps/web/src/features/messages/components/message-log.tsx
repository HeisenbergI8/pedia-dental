"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { LoaderCircleIcon, MessageSquareIcon } from "lucide-react";
import { MessageStatus } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { usePatients } from "@/features/patients/api";
import { PatientName } from "@/features/patients/components/patient-name";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KIND_LABEL, MESSAGE_STATUS_LABEL, useMessages } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const STATUS_TONE: Record<MessageStatus, string> = {
  queued: "bg-info-bg text-info",
  sent: "bg-success-bg text-success",
  failed: "bg-danger-bg text-danger",
  cancelled: "bg-ground text-ink-muted",
};

/** Two lines of the SMS by default: the log is for scanning; the full text is one tap away. */
function MessageBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const long = body.length > 110;
  return (
    <div className="text-sm text-ink-muted">
      <p className={cn(!open && long && "line-clamp-2")}>{body}</p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-0.5 inline-flex min-h-(--control-h-sm) items-center font-medium text-brand">
          {open ? "Show less" : "Show message"}
        </button>
      )}
    </div>
  );
}

export function MessageLog() {
  const [status, setStatus] = useState<MessageStatus | "all">("all");
  const log = useMessages(status === "all" ? undefined : status);
  const patientsQuery = usePatients();
  const patients = patientsQuery.data ?? [];

  const options = [["all", "All"] as const, ...MessageStatus.options.map((s) => [s, MESSAGE_STATUS_LABEL[s]] as const)];
  const shown = log.data?.pages.flat() ?? [];

  return (
    <SectionCard>
      {/* One scrolling row of filters on a phone (fading at the edge), wrapping from md. */}
      <div role="group" aria-label="Show messages" className="scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {options.map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            className="shrink-0 rounded-full"
            variant={status === value ? "default" : "outline"}
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {log.isLoading ? (
        <Loading label="Loading messages" />
      ) : log.error ? (
        <ErrorState what="the messages" onRetry={() => log.refetch()} retrying={log.isRefetching} />
      ) : shown.length === 0 ? (
        <EmptyState icon={MessageSquareIcon} title={status === "all" ? "No messages yet" : `No ${MESSAGE_STATUS_LABEL[status].toLowerCase()} messages`}>
          Booking an appointment, a no-show or a signed extraction note queues a message here. Booking an extraction or pulpotomy also queues pre-treatment instructions.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((m) => {
            const p = patients.find((x) => x.id === m.patientId);
            return (
              <li key={m.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[m.status])}>{MESSAGE_STATUS_LABEL[m.status]}</span>
                  <span className="font-medium">{KIND_LABEL[m.kind]}</span>
                  <Link href={`/patients/${m.patientId}`} className="text-brand underline-offset-2 hover:underline">
                    <PatientName patient={p} loading={patientsQuery.isLoading} />
                  </Link>
                  <span className="text-ink-muted">
                    to {m.recipientName} · <span className="whitespace-nowrap">{formatPhone(m.to)}</span>
                  </span>
                  <span className="text-ink-muted whitespace-nowrap tabular-nums sm:ml-auto">{format(parseISO(m.sendAt), "MMM d, h:mm a")}</span>
                </div>
                <MessageBody body={m.body} />
                {m.failureReason && <p className="text-sm text-danger">{m.failureReason}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {log.hasNextPage && (
            <Button variant="outline" disabled={log.isFetchingNextPage} aria-busy={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
              {log.isFetchingNextPage && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
              Load older
            </Button>
          )}
          <span className="text-sm text-ink-muted tabular-nums" aria-live="polite">
            {log.hasNextPage ? `Showing the latest ${shown.length}` : `Showing all ${shown.length}`}
          </span>
        </div>
      )}
      <p className="text-xs text-ink-muted">Texts go out between 8 AM and 8 PM, Philippine time. Until SMS sending is switched on, they are logged here only.</p>
    </SectionCard>
  );
}
