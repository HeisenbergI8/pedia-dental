"use client";
import { deriveChart, type Patient, type ToothNumber } from "@pedia/shared";
import { useChartEntries } from "../api";
import { DentalChart, defaultChartMode } from "./dental-chart";

/** The patient's chart in selection mode: click teeth to toggle them. Current findings show for context. */
export function ToothPicker({
  patient,
  value,
  onChange,
}: {
  patient: Patient;
  value: ToothNumber[];
  onChange: (teeth: ToothNumber[]) => void;
}) {
  const { data: entries } = useChartEntries(patient.id);
  const toggle = (t: ToothNumber) =>
    onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t].sort((a, b) => a - b));

  return (
    <div className="space-y-2">
      <p className="text-sm" aria-live="polite">
        {value.length ? `Selected: ${value.join(", ")}` : "No teeth selected."}
      </p>
      <DentalChart
        chart={deriveChart(entries ?? [])}
        defaultMode={defaultChartMode(patient.birthDate)}
        selected={value}
        onSelect={toggle}
      />
    </div>
  );
}
