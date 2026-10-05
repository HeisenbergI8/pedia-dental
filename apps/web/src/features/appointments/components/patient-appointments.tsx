"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePatientAppointments } from "../api";
import { StatusChip } from "./status-chip";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const UPCOMING = new Set(["booked", "confirmed", "arrived", "in_chair"]);

export function PatientAppointments({ patientId }: { patientId: string }) {
  const { data, isLoading, error, refetch, isRefetching } = usePatientAppointments(patientId);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  // "Save and book appointment" on New patient lands here with ?book=1: open booking once, then drop the param.
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (params.get("book") !== "1") return;
    setDraft({ patientId });
    const q = new URLSearchParams(params);
    q.delete("book");
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [params, patientId, pathname, router]);
  const noShows = data?.filter((a) => a.status === "no_show").length ?? 0;
  const upcoming = data?.filter((a) => UPCOMING.has(a.status)) ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Appointments
          {data && (
            <Badge variant={noShows ? "destructive" : "outline"} className="ml-2 align-middle">
              {noShows} {noShows === 1 ? "no-show" : "no-shows"}
            </Badge>
          )}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setDraft({ patientId })}>
          Book appointment
        </Button>
      </div>
      {isLoading && <Loading label="Loading appointments" />}
      {error && <ErrorState compact what="the appointments" onRetry={() => refetch()} retrying={isRefetching} />}
      {data && upcoming.length === 0 && <p className="text-ink-muted">Nothing booked.</p>}
      {upcoming.length > 0 && (
        <ul className="divide-y divide-line">
          {upcoming.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
              {/* Two lines on a phone (when / what), so the status chip keeps one column on the right. */}
              <span className="min-w-0">
                <span className="block font-medium tabular-nums sm:inline">{format(parseISO(a.startsAt), "EEE, MMM d · h:mm a")}</span>
                <span className="block text-ink-muted sm:inline">
                  <span className="hidden sm:inline"> · </span>
                  {a.reason}
                </span>
              </span>
              <StatusChip status={a.status} />
            </li>
          ))}
        </ul>
      )}
      <AppointmentForm draft={draft} onClose={() => setDraft(null)} />
    </section>
  );
}
