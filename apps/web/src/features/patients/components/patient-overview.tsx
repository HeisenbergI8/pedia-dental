"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Patient } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CONSENT_LABEL, ConsentDialog } from "./consent-dialog";

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p>{items.length ? items.join(", ") : "None recorded"}</p>
    </div>
  );
}

export function PatientOverview({ patient: p }: { patient: Patient }) {
  const guardianName = (id: string) => p.guardians.find((g) => g.id === id)?.fullName ?? "Former guardian";
  const emergency = p.emergencyContact?.name ? p.emergencyContact : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card
        title="Guardians"
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/patients/${p.id}/edit`}>Edit profile</Link>
          </Button>
        }
      >
        <ul className="space-y-3">
          {p.guardians.map((g) => (
            <li key={g.id}>
              <p className="font-medium">
                {g.fullName} <span className="font-normal text-ink-muted">· {g.relationship}</span>
                {g.isPrimary && <Badge className="ml-2">Primary</Badge>}
              </p>
              <p className="text-sm">{[g.phone, g.email].filter(Boolean).join(" · ")}</p>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-3 text-sm">
          <p className="text-ink-muted">Emergency contact</p>
          <p>{emergency ? `${emergency.name} · ${emergency.phone}` : "None recorded"}</p>
          <p className="mt-2 text-ink-muted">Address</p>
          <p>{p.address || "None recorded"}</p>
        </div>
      </Card>

      <Card title="Medical">
        <div className="space-y-3">
          <List label="Allergies" items={p.allergies} />
          <List label="Medical conditions" items={p.medicalConditions} />
          <List label="Medications" items={p.medications} />
          <List label="Alerts" items={p.alerts} />
        </div>
      </Card>

      <Card title="Previous dental history">
        <p className="text-sm text-ink-muted">Previous clinic</p>
        <p>{p.dentalHistory.previousClinic || "None recorded"}</p>
        <p className="text-sm text-ink-muted">Notes</p>
        <p className="whitespace-pre-line">{p.dentalHistory.notes || "None recorded"}</p>
      </Card>

      <Card title="Consents" action={<ConsentDialog patient={p} />}>
        {p.consents.length === 0 ? (
          <p className="text-ink-muted">No consents recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {p.consents.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="font-medium">{CONSENT_LABEL[c.scope]}</span>
                <span className="text-right text-sm text-ink-muted">
                  {guardianName(c.guardianId)}, {c.date}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
