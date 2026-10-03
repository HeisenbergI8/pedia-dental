"use client";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import type { Patient } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPhone } from "@/lib/format";
import { CONSENT_LABEL, ConsentDialog } from "./consent-dialog";

/** Label above value: the label is secondary, the value is what staff read. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const listOrNone = (items: string[]) => (items.length ? items.join(", ") : <span className="text-ink-muted">None recorded</span>);
const textOrNone = (text: string | undefined) => text || <span className="text-ink-muted">None recorded</span>;

/** The reference column of the overview: medical, contacts, history and consents. */
export function PatientOverview({ patient: p }: { patient: Patient }) {
  const guardianName = (id: string) => p.guardians.find((g) => g.id === id)?.fullName ?? "Former guardian";
  const emergency = p.emergencyContact?.name ? p.emergencyContact : undefined;

  return (
    <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
      <SectionCard
        title="Medical"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/patients/${p.id}/edit`}><PencilIcon /> Edit profile</Link>
          </Button>
        }
      >
        <dl className="space-y-3">
          <Field label="Allergies">{listOrNone(p.allergies)}</Field>
          <Field label="Medical conditions">{listOrNone(p.medicalConditions)}</Field>
          <Field label="Medications">{listOrNone(p.medications)}</Field>
          <Field label="Notes and alerts">{listOrNone(p.alerts)}</Field>
        </dl>
      </SectionCard>

      <SectionCard title="Guardians">
        <ul className="space-y-3">
          {p.guardians.map((g) => (
            <li key={g.id} className="space-y-0.5">
              <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                {g.fullName}
                <span className="font-normal text-ink-muted">{g.relationship}</span>
                {g.isPrimary && <Badge variant="secondary" className="border-line">Primary</Badge>}
              </p>
              <p className="text-sm">
                <a href={`tel:${g.phone}`} className="text-brand tabular-nums hover:underline">{formatPhone(g.phone)}</a>
                {g.email && <span className="text-ink-muted"> · {g.email}</span>}
              </p>
            </li>
          ))}
        </ul>
        <dl className="space-y-3 border-t border-line pt-3">
          <Field label="Emergency contact">
            {emergency ? <>{emergency.name} · <span className="tabular-nums">{formatPhone(emergency.phone)}</span></> : textOrNone(undefined)}
          </Field>
          <Field label="Address">{textOrNone(p.address)}</Field>
        </dl>
      </SectionCard>

      <SectionCard title="Consents" action={<ConsentDialog patient={p} />}>
        {p.consents.length === 0 ? (
          <p className="text-sm text-ink-muted">No consents recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.consents.map((c) => (
              <li key={c.id} className="space-y-0.5 py-2 first:pt-0 last:pb-0">
                <p className="text-sm font-medium">{CONSENT_LABEL[c.scope]}</p>
                <p className="text-xs text-ink-muted">
                  {guardianName(c.guardianId)} · {formatDate(c.date)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Previous dental history">
        <dl className="space-y-3">
          <Field label="Previous clinic">{textOrNone(p.dentalHistory.previousClinic)}</Field>
          <Field label="Notes"><span className="whitespace-pre-line">{textOrNone(p.dentalHistory.notes)}</span></Field>
        </dl>
      </SectionCard>
    </div>
  );
}
