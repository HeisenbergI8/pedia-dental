"use client";
import { usePatient } from "../api";
import { formatAge } from "../age";

/** Shown on every patient screen. Allergies and alerts are never hidden. */
export function PatientHeader({ patientId }: { patientId: string }) {
  const { data: p, isLoading } = usePatient(patientId);
  if (isLoading || !p) return <p className="text-ink-muted">Loading patient…</p>;
  const alerts = [...p.allergies.map((a) => `Allergy: ${a}`), ...p.medicalConditions, ...p.alerts];

  return (
    <header className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">{p.firstName} {p.lastName}</h1>
        <p className="text-ink-muted">
          {formatAge(p.birthDate)}, {p.sex}, born {p.birthDate}
        </p>
      </div>
      {alerts.length > 0 && (
        <p role="alert" className="rounded-md bg-alert-bg px-4 py-3 font-medium text-alert">
          {alerts.join(" · ")}
        </p>
      )}
    </header>
  );
}
