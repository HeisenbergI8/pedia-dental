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

const STATUS_TONE: Record<MessageStatus, string> = {
  queued: "bg-info-bg text-info",
  sent: "bg-success-bg text-success",
  failed: "bg-danger-bg text-danger",
  cancelled: "bg-ground text-ink-muted",
};

export function MessageLog() {
  const { data: rows = [], isLoading, error } = useMessages();
  const patients = usePatients().data ?? [];
  const [status, setStatus] = useState<MessageStatus | "all">("all");

  if (isLoading) return <Loading label="Loading messages…" />;
  if (error) return <p className="text-danger">Couldn&apos;t load messages. Refresh to try again.</p>;
  const shown = status === "all" ? rows : rows.filter((m) => m.status === status);
  const options = [
    ["all", "All", rows.length] as const,
    ...MessageStatus.options.map((s) => [s, MESSAGE_STATUS_LABEL[s], rows.filter((m) => m.status === s).length] as const),
  ];

  return (
    <SectionCard>
      <div role="group" aria-label="Show messages" className="flex flex-wrap gap-2">
        {options.map(([value, label, count]) => (
          <Button key={value} size="sm" variant={status === value ? "default" : "outline"} aria-pressed={status === value} onClick={() => setStatus(value)}>
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
          {shown.map((m) => {
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
                    to {m.recipientName} · {formatPhone(m.to)}
                  </span>
                  <span className="ml-auto text-ink-muted tabular-nums">{format(parseISO(m.sendAt), "MMM d, h:mm a")}</span>
                </div>
                <p className="text-sm text-ink-muted">{m.body}</p>
                {m.failureReason && <p className="text-sm text-danger">{m.failureReason}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-ink-muted">Prototype: messages are queued and logged here, never actually sent.</p>
    </SectionCard>
  );
}
