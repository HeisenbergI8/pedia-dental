"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { deriveChart, type Patient, type Surface, type ToothNumber } from "@pedia/shared";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useChartEntries } from "../api";
import { DentalChart, defaultChartMode } from "./dental-chart";
import { ToothPanel } from "./tooth-panel";

const LATEST = "latest";

export function ChartTab({ patient }: { patient: Patient }) {
  const { data: entries, isLoading, error } = useChartEntries(patient.id);
  const visits = useVisits(patient.id).data ?? [];
  const current = useCurrentVisit(patient.id);
  const [asOf, setAsOf] = useState(LATEST);
  const [open, setOpen] = useState<{ tooth: ToothNumber; surface?: Surface }>();

  if (isLoading) return <p className="text-ink-muted">Loading chart…</p>;
  if (error || !entries) return <p className="text-danger">Couldn&apos;t load the chart.</p>;

  // "As of visit X": only what was recorded up to and including that visit, later corrections excluded.
  const asOfVisit = visits.find((v) => v.id === asOf);
  const shownVisitIds = asOfVisit && new Set(visits.filter((v) => v.startedAt <= asOfVisit.startedAt).map((v) => v.id));
  const chart = deriveChart(shownVisitIds ? entries.filter((e) => shownVisitIds.has(e.visitId)) : entries);

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="chart-as-of">Chart as of</Label>
        <Select value={asOf} onValueChange={setAsOf}>
          <SelectTrigger id="chart-as-of" className="w-72 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LATEST}>Latest</SelectItem>
            {visits.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                Visit of {format(parseISO(v.date), "MMM d, yyyy")}
                {/* Several visits on one day are told apart by start time. */}
                {visits.some((o) => o.id !== v.id && o.date === v.date) && `, ${format(parseISO(v.startedAt), "h:mm a")}`}
                {v.status === "in_progress" && " (current)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DentalChart
        chart={chart}
        defaultMode={defaultChartMode(patient.birthDate)}
        selected={open ? [open.tooth] : []}
        onSelect={(tooth, surface) => setOpen({ tooth, surface })}
      />

      {open && (
        <ToothPanel
          key={`${open.tooth}-${open.surface}`}
          patientId={patient.id}
          tooth={open.tooth}
          surface={open.surface}
          state={chart.get(open.tooth)}
          visits={visits}
          recordingVisit={asOf === LATEST ? current : undefined}
          historical={asOf !== LATEST}
          onClose={() => {
            const tooth = open.tooth;
            setOpen(undefined);
            // The panel unmounts on close, so hand focus back to the tooth that opened it.
            setTimeout(() => document.querySelector<HTMLElement>(`[data-tooth="${tooth}"]`)?.focus());
          }}
        />
      )}
    </section>
  );
}
