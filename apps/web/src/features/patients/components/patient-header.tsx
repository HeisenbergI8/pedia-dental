"use client";
import Link from "next/link";
import { AlertTriangleIcon, ChevronLeftIcon, HeartPulseIcon, InfoIcon, PhoneIcon, UsersIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Patient } from "@pedia/shared";
import { formatDate, formatPhone, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatient, usePatients } from "../api";
import { formatAge } from "../age";
import { Loading } from "@/components/brand";

const SEX_LABEL = { female: "Female", male: "Male" } as const;

function AlertChip({ icon: Icon, label, strong }: { icon: LucideIcon; label: string; strong?: boolean }) {
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm",
        strong ? "border-alert-line bg-alert-bg font-semibold text-alert" : "border-line bg-ground text-ink",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </li>
  );
}

/**
 * Shown on every patient screen and pinned while the page scrolls, so the
 * patient's identity, allergies and alerts are never out of sight.
 */
export function PatientHeader({ patientId }: { patientId: string }) {
  const { data: p, isLoading } = usePatient(patientId);
  // Same guardian phone = sibling: named in the header so the wrong child is hard to chart on.
  const all = usePatients().data ?? [];
  const siblings = p ? all.filter((x) => x.id !== p.id && x.guardians.some((g) => p.guardians.some((h) => h.phone === g.phone))) : [];

  return (
    <header
      data-patient-header
      className="sticky top-14 z-(--z-sticky) -mx-4 border-b border-line bg-ground/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:top-0 lg:-mx-8 lg:px-8"
    >
      <Link
        href="/patients"
        className="mb-2 hidden items-center gap-1 rounded-sm text-sm text-ink-muted hover:text-ink sm:inline-flex"
      >
        <ChevronLeftIcon className="size-4" aria-hidden /> Patients
      </Link>
      {isLoading || !p ? (
        <Loading label="Loading patient…" compact />
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-base font-semibold text-brand-ink"
            >
              {initials(p.firstName, p.lastName)}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {p.firstName} {p.lastName}
              </h1>
              <p className="text-sm text-ink-muted">
                <span className="font-medium text-ink">{formatAge(p.birthDate)}</span>
                {" · "}
                {SEX_LABEL[p.sex]} · Born {formatDate(p.birthDate)}
              </p>
              {siblings.length > 0 && (
                <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-info-line bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
                  <UsersIcon className="size-3 shrink-0" aria-hidden />
                  Sibling of{" "}
                  {siblings.map((x, i) => (
                    <span key={x.id}>
                      {i > 0 && ", "}
                      <Link href={`/patients/${x.id}`} className="underline underline-offset-2">{x.firstName}</Link>
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
          <PrimaryGuardian guardians={p.guardians} />
        </div>
      )}
      {p && <MedicalAlerts allergies={p.allergies} conditions={p.medicalConditions} alerts={p.alerts} />}
    </header>
  );
}

function PrimaryGuardian({ guardians }: { guardians: Patient["guardians"] }) {
  const g = guardians.find((x) => x.isPrimary) ?? guardians[0];
  if (!g) return null;
  return (
    // Hidden on phones to keep the pinned header short; the Guardians card has it.
    <p className="hidden text-sm sm:block md:text-right">
      <span className="text-ink-muted">{g.relationship}: </span>
      <span className="font-medium">{g.fullName}</span>
      <a href={`tel:${g.phone}`} className="ml-2 inline-flex items-center gap-1 rounded-sm text-brand tabular-nums hover:underline">
        <PhoneIcon className="size-3.5" aria-hidden />
        {formatPhone(g.phone)}
      </a>
    </p>
  );
}

function MedicalAlerts({ allergies, conditions, alerts }: { allergies: string[]; conditions: string[]; alerts: string[] }) {
  const none = allergies.length + conditions.length + alerts.length === 0;
  return (
    <section aria-label="Medical alerts" className="mt-3">
      {none ? (
        <p className="text-sm text-ink-muted">No allergies, conditions or alerts recorded.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {allergies.map((a) => (
            <AlertChip key={`a-${a}`} icon={AlertTriangleIcon} label={`Allergy: ${a}`} strong />
          ))}
          {conditions.map((c) => (
            <AlertChip key={`c-${c}`} icon={HeartPulseIcon} label={c} strong />
          ))}
          {alerts.map((a) => (
            <AlertChip key={`n-${a}`} icon={InfoIcon} label={a} />
          ))}
        </ul>
      )}
    </section>
  );
}
