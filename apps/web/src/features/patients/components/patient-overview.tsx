"use client";
import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { filledProfile, type PatientView } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan } from "@/features/auth/access";
import { formatDate, formatPhone } from "@/lib/format";
import { CONSENT_LABEL } from "../api";
import { ConsentDialog } from "./consent-dialog";
import { QuickUpdateDialog } from "./quick-update-dialog";

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

/** The reference column of the overview: medical, contacts, history and consents. */
export function PatientOverview({ patient: p }: { patient: PatientView }) {
  const guardianName = (id: string) => p.guardians.find((g) => g.id === id)?.fullName ?? "Former guardian";
  const emergency = p.emergencyContact?.name ? p.emergencyContact : undefined;
  const about = filledProfile(p.profile);
  const can = useCan();
  const canContact = can("patients.contact"); // phones, email and address: admin and front desk only
  const history = [p.dentalHistory.previousClinic, p.dentalHistory.notes].some(Boolean);

  return (
    <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
      <SectionCard
        title="Medical"
        action={
          <Can permission="patients.write">
            <div className="flex flex-wrap gap-2">
              <QuickUpdateDialog patient={p} />
              <Button asChild variant="ghost" size="sm">
                <Link href={`/patients/${p.id}/edit`}><PencilIcon /> Edit profile</Link>
              </Button>
            </div>
          </Can>
        }
      >
        <dl className="space-y-3">
          <Field label="Allergies">{listOrNone(p.allergies)}</Field>
          <Field label="Medical conditions">{listOrNone(p.medicalConditions)}</Field>
          <Field label="Medications">{listOrNone(p.medications)}</Field>
          <Field label="Notes and alerts">{listOrNone(p.alerts)}</Field>
        </dl>
      </SectionCard>

      <SectionCard title={`About ${p.firstName}`}>
        {(p.tags?.length ?? 0) > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {p.tags!.map((t) => (
              <li key={t}>
                <Badge variant="secondary" className="border-line">{t}</Badge>
              </li>
            ))}
          </ul>
        )}
        {/* Only what was filled in: never a column of "None recorded". */}
        {about.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {about.map((r) => (
              <Field key={r.key} label={r.label}>
                <span className="whitespace-pre-line">{r.value}</span>
              </Field>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">
            {(p.tags?.length ?? 0) > 0 ? "No other details recorded yet." : "No school, HMO or habits recorded yet."}
            {can("patients.write") && (
              <>
                {" "}
                <Link href={`/patients/${p.id}/edit`} className="text-brand underline underline-offset-2">
                  Add details
                </Link>
              </>
            )}
          </p>
        )}
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
              {canContact && (
                <p className="text-sm">
                  {g.phone && <a href={`tel:${g.phone}`} className="text-brand tabular-nums hover:underline">{formatPhone(g.phone)}</a>}
                  {g.email && <span className="text-ink-muted"> · {g.email}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
        {canContact ? (
          (emergency || p.address) && (
            <dl className="space-y-3 border-t border-line pt-3">
              {emergency && (
                <Field label="Emergency contact">
                  {emergency.name} · <span className="tabular-nums">{formatPhone(emergency.phone)}</span>
                </Field>
              )}
              {p.address && <Field label="Address">{p.address}</Field>}
            </dl>
          )
        ) : (
          <p className="border-t border-line pt-3 text-sm text-ink-muted">Contact details are visible to front desk and admin.</p>
        )}
      </SectionCard>

      <SectionCard title="Consents" action={<Can permission="patients.write"><ConsentDialog patient={p} /></Can>}>
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
        {history ? (
          <dl className="space-y-3">
            {p.dentalHistory.previousClinic && <Field label="Previous clinic">{p.dentalHistory.previousClinic}</Field>}
            {p.dentalHistory.notes && (
              <Field label="Notes">
                <span className="whitespace-pre-line">{p.dentalHistory.notes}</span>
              </Field>
            )}
          </dl>
        ) : (
          <p className="text-sm text-ink-muted">No previous clinic or history recorded.</p>
        )}
      </SectionCard>
    </div>
  );
}
