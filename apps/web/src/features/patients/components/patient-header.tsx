"use client";
import Link from "next/link";
import { AlertTriangleIcon, ChevronLeftIcon, CircleDollarSignIcon, HeartPulseIcon, InfoIcon, PhoneIcon, UsersIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { format, isThisYear, parseISO } from "date-fns";
import { formatPeso, type PatientView, type PatientHeaderSummary } from "@pedia/shared";
import { useCan } from "@/features/auth/access";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatient, usePatientSummary } from "../api";
import { formatAge } from "../age";
import { Loading } from "@/components/brand";
import { MetaLine } from "@/components/meta-line";
import { PatientAvatar } from "./patient-avatar";
import { PatientPhotoDialog } from "./patient-photo-dialog";

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
  const summary = usePatientSummary(patientId).data;
  const canEdit = useCan()("patients.write");
  // Same guardian phone = sibling, worked out by the server (phones never reach a dentist): named in the header so
  // the wrong child is hard to chart on.
  const siblings = summary?.siblings ?? [];

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
            {canEdit ? <PatientPhotoDialog patient={p} /> : <PatientAvatar patient={p} />}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {p.firstName} {p.lastName}
                {/* Next to the name, never instead of it: the legal name stays the identifier. */}
                {p.nickname && <span className="font-normal text-ink-muted"> “{p.nickname}”</span>}
              </h1>
              <MetaLine
                items={[
                  <span key="age" className="font-medium text-ink">{formatAge(p.birthDate)}</span>,
                  SEX_LABEL[p.sex],
                  `Born ${formatDate(p.birthDate)}`,
                ]}
              />
              {summary && <RecordFacts summary={summary} />}
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

const shortDate = (iso: string) => format(parseISO(iso), isThisYear(parseISO(iso)) ? "MMM d" : "MMM d, yyyy");

/** One line of reference facts, adding at most one line to the pinned header. Money only when there is some. */
function RecordFacts({ summary: s }: { summary: PatientHeaderSummary }) {
  return (
    <MetaLine
      items={[
        <span key="no" className="tabular-nums">
          <span className="sr-only">Patient number </span>
          {s.patientNo}
        </span>,
        s.lastVisitOn ? `Last visit ${shortDate(s.lastVisitOn)}` : "No visits yet",
        !!s.balance && s.balance > 0 && (
          <span key="due" className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-warning tabular-nums">
            <CircleDollarSignIcon className="size-3.5" aria-hidden />
            {formatPeso(s.balance)} due
          </span>
        ),
        !!s.credit && s.credit > 0 && (
          <span key="credit" className="font-medium whitespace-nowrap text-success tabular-nums">
            {formatPeso(s.credit)} credit
          </span>
        ),
      ]}
    />
  );
}

function PrimaryGuardian({ guardians }: { guardians: PatientView["guardians"] }) {
  const canContact = useCan()("patients.contact"); // phone numbers: admin and front desk only
  const g = guardians.find((x) => x.isPrimary) ?? guardians[0];
  if (!g) return null;
  return (
    // Hidden on phones to keep the pinned header short; the Guardians card has it.
    <p className="hidden text-sm sm:block md:text-right">
      <span className="text-ink-muted">{g.relationship}: </span>
      <span className="font-medium">{g.fullName}</span>
      {canContact && g.phone && (
        <a href={`tel:${g.phone}`} className="ml-2 inline-flex items-center gap-1 rounded-sm text-brand tabular-nums hover:underline">
          <PhoneIcon className="size-3.5" aria-hidden />
          {formatPhone(g.phone)}
        </a>
      )}
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
