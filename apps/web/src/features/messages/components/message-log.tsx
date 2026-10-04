"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { MessageSquareIcon } from "lucide-react";
import { MessageStatus } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { usePatients } from "@/features/patients/api";
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

const PAGE = 25;

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
  const { data: rows = [], isLoading, error, refetch, isRefetching } = useMessages();
  const patients = usePatients().data ?? [];
  const [status, setStatus] = useState<MessageStatus | "all">("all");
  const [limit, setLimit] = useState(PAGE);

  if (isLoading) return <Loading label="Loading messages" />;
  if (error) return <ErrorState what="the messages" onRetry={() => refetch()} retrying={isRefetching} />;
  const shown = status === "all" ? rows : rows.filter((m) => m.status === status);
  const options = [
    ["all", "All", rows.length] as const,
    ...MessageStatus.options.map((s) => [s, MESSAGE_STATUS_LABEL[s], rows.filter((m) => m.status === s).length] as const),
  ];

  return (
    <SectionCard>
      {/* One scrolling row of filters on a phone (fading at the edge), wrapping from md. */}
      <div role="group" aria-label="Show messages" className="scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {options.map(([value, label, count]) => (
          <Button
            key={value}
            size="sm"
            className="shrink-0 rounded-full"
            variant={status === value ? "default" : "outline"}
            aria-pressed={status === value}
            onClick={() => {
              setStatus(value);
              setLimit(PAGE);
            }}
          >
            {label} <span className="tabular-nums">({count})</span>
          </Button>
        ))}
      </div>
      {shown.length === 0 ? (
        <EmptyState icon={MessageSquareIcon} title={status === "all" ? "No messages yet" : `No ${MESSAGE_STATUS_LABEL[status].toLowerCase()} messages`}>
          Booking an appointment, a no-show or a signed extraction note queues a message here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {shown.slice(0, limit).map((m) => {
            const p = patients.find((x) => x.id === m.patientId);
            return (
              <li key={m.id} className="space-y-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_TONE[m.status])}>{MESSAGE_STATUS_LABEL[m.status]}</span>
                  <span className="font-medium">{KIND_LABEL[m.kind]}</span>
                  <Link href={`/patients/${m.patientId}`} className="text-brand underline-offset-2 hover:underline">
                    {p ? `${p.lastName}, ${p.firstName}` : "Patient"}
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
      {shown.length > limit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setLimit(limit + PAGE)}>
            Show {Math.min(PAGE, shown.length - limit)} more
          </Button>
          <span className="text-sm text-ink-muted tabular-nums">
            Showing {limit} of {shown.length}
          </span>
        </div>
      )}
      <p className="text-xs text-ink-muted">Prototype: messages are queued and logged here, never actually sent.</p>
    </SectionCard>
  );
}
