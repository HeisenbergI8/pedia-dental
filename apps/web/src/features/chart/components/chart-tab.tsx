"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { deriveChart, type PatientView, type Surface, type ToothNumber } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCan } from "@/features/auth/access";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useChartEntries } from "../api";
import { DentalChart, defaultChartMode } from "./dental-chart";
import { BatchPanel } from "./batch-panel";
import { ToothPanel } from "./tooth-panel";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const LATEST = "latest";

export function ChartTab({ patient }: { patient: PatientView }) {
  const { data: entries, isLoading, error, refetch, isRefetching } = useChartEntries(patient.id);
  const visits = useVisits(patient.id).data ?? [];
  const current = useCurrentVisit(patient.id);
  const [asOf, setAsOf] = useState(LATEST);
  const [open, setOpen] = useState<{ tooth: ToothNumber; surface?: Surface }>();
  // "Select several": taps collect teeth for one finding saved on each of them.
  const [multi, setMulti] = useState(false);
  const [picked, setPicked] = useState<ToothNumber[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const canRecord = useCan()("clinical.write") && !!current;

  if (isLoading) return <Loading label="Loading chart…" />;
  if (error || !entries) return <ErrorState what="the dental chart" onRetry={() => refetch()} retrying={isRefetching} />;

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
        {canRecord && asOf === LATEST && (
          <Button
            variant={multi ? "default" : "outline"}
            size="sm"
            aria-pressed={multi}
            className="ml-auto"
            onClick={() => {
              setMulti(!multi);
              setPicked([]);
            }}
          >
            {multi ? "Done selecting" : "Select several"}
          </Button>
        )}
      </div>

      <DentalChart
        chart={chart}
        defaultMode={defaultChartMode(patient.birthDate)}
        selected={multi ? picked : open ? [open.tooth] : []}
        onSelect={(tooth, surface) =>
          multi ? setPicked((p) => (p.includes(tooth) ? p.filter((t) => t !== tooth) : [...p, tooth])) : setOpen({ tooth, surface })
        }
      />

      {multi && (
        // Sticky above the phone bottom nav, like the form action bar; it lists every pick, even off-screen ones.
        <div className="sticky bottom-(--bottom-nav-h) z-(--z-sticky) -mx-4 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <p className="text-sm" aria-live="polite">
            {picked.length ? (
              <>
                Teeth <span className="font-semibold tabular-nums">{[...picked].sort((a, b) => a - b).join(", ")}</span>
              </>
            ) : (
              "Tap the teeth to include"
            )}
          </p>
          <Button disabled={picked.length < 2} onClick={() => setBatchOpen(true)}>
            Record finding
          </Button>
        </div>
      )}
      {batchOpen && current && (
        <BatchPanel
          patientId={patient.id}
          teeth={picked}
          visit={current}
          onClose={(saved) => {
            setBatchOpen(false);
            if (saved) {
              setPicked([]);
              setMulti(false);
            }
          }}
        />
      )}

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
