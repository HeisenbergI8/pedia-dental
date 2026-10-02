"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, usePatientAppointments } from "../api";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";

const UPCOMING = new Set(["booked", "confirmed", "arrived", "in_chair"]);

export function PatientAppointments({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = usePatientAppointments(patientId);
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const noShows = data?.filter((a) => a.status === "no_show").length ?? 0;
  const upcoming = data?.filter((a) => UPCOMING.has(a.status)) ?? [];

  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
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
      {isLoading && <p className="text-ink-muted">Loading appointments…</p>}
      {error && <p className="text-danger">Couldn&apos;t load appointments.</p>}
      {data && upcoming.length === 0 && <p className="text-ink-muted">Nothing booked.</p>}
      {upcoming.length > 0 && (
        <ul className="divide-y divide-line">
          {upcoming.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                {format(parseISO(a.startsAt), "EEE, MMM d · h:mm a")}
                <span className="text-ink-muted"> · {a.reason}</span>
              </span>
              <Badge variant="outline">{STATUS_LABEL[a.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
      <AppointmentForm draft={draft} onClose={() => setDraft(null)} />
    </section>
  );
}
