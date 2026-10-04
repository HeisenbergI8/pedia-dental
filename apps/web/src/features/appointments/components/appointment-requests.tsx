"use client";
import Link from "next/link";
import { useState } from "react";
import { format, parseISO, setHours } from "date-fns";
import { toast } from "sonner";
import { SectionCard } from "@/components/section-card";
import { MetaLine } from "@/components/meta-line";
import { Button } from "@/components/ui/button";
import { usePatients } from "@/features/patients/api";
import { TIME_OF_DAY_LABEL, useMarkRequestHandled, usePendingRequests } from "../api";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";

export function AppointmentRequests() {
  const { data: requests = [] } = usePendingRequests();
  const patients = usePatients().data ?? [];
  const handled = useMarkRequestHandled();
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  if (requests.length === 0) return null;

  return (
    // The dashboard's "Booking requests" tile links here.
    <div id="requests" className="scroll-mt-24">
      <SectionCard title={`Requests from parents (${requests.length})`} description="Call the parent, book a slot, then mark the request handled.">
        <ul className="divide-y divide-line">
          {requests.map((r) => {
            const p = patients.find((x) => x.id === r.patientId);
            const start = setHours(parseISO(r.preferredDate), r.timeOfDay === "afternoon" ? 13 : 9);
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/patients/${r.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
                    {p ? `${p.lastName}, ${p.firstName}` : "Patient"}
                  </Link>
                  <MetaLine items={[r.reason, format(start, "EEE, MMM d"), TIME_OF_DAY_LABEL[r.timeOfDay]]} />
                  {/* The parent's own words get their own line: free text in a run of facts is hard to read. */}
                  {r.note && <p className="mt-0.5 text-sm text-ink">“{r.note}”</p>}
                </div>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setDraft({ patientId: r.patientId, reason: r.reason, start: start < new Date() ? new Date() : start })}>
                    Book…
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={handled.isPending}
                    onClick={() => handled.mutate(r.id, { onSuccess: () => toast.success("Marked handled"), onError: (e) => toast.error(e.message) })}
                  >
                    Mark handled
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      </SectionCard>
      <AppointmentForm draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
