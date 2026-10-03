"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO, setHours } from "date-fns";
import { BellRingIcon } from "lucide-react";
import { DEFAULT_FOLLOW_UP_RULES, dueBucket, type DueBucket, type DueItem } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { AppointmentForm, type AppointmentDraft } from "@/features/appointments/components/appointment-form";
import { useProcedures } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { formatDate, formatPhone } from "@/lib/format";
import { useDueItems } from "../api";

const SECTIONS: { bucket: DueBucket; title: string; empty: string }[] = [
  { bucket: "overdue", title: "Overdue", empty: "Nothing overdue." },
  { bucket: "this_week", title: "Due this week", empty: "Nothing due in the next 7 days." },
  { bucket: "this_month", title: "Due this month", empty: "Nothing else due in the next 30 days." },
];

/** Follow-ups and recalls due within 30 days. Booking one opens the appointment form already filled in. */
export function RecallList() {
  const { data: items, isLoading, error } = useDueItems();
  const patients = usePatients().data ?? [];
  const procedures = useProcedures().data ?? [];
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const today = format(new Date(), "yyyy-MM-dd");

  const procedureName = (code: string) => procedures.find((p) => p.code === code)?.name ?? code;
  /** "Follow-up after extraction" or "6-month recall", worded from the rule. */
  const what = (i: DueItem) => {
    if (i.kind === "follow_up") return `Follow-up after ${procedureName(i.procedure).toLowerCase()}`;
    const months = DEFAULT_FOLLOW_UP_RULES.find((r) => r.id === i.ruleId)?.interval.months;
    return months ? `${months}-month recall` : "Recall";
  };

  function book(i: DueItem) {
    const visitCode = i.kind === "follow_up" ? "follow_up" : "oral_exam";
    const due = setHours(parseISO(i.dueOn), 9);
    setDraft({
      patientId: i.patientId,
      reason: what(i),
      durationMin: procedures.find((p) => p.code === visitCode)?.defaultDurationMin,
      sourceRuleId: i.ruleId,
      start: due < new Date() ? new Date() : due, // overdue: offer now, never a past slot
    });
  }

  if (isLoading) return <p className="text-ink-muted">Loading recalls…</p>;
  if (error) return <p className="text-danger">Couldn&apos;t load recalls. Refresh to try again.</p>;
  const listed = (items ?? []).filter((i) => dueBucket(i.dueOn, today));

  return (
    <div className="space-y-5">
      <PageHeader title="Recalls" description="Follow-ups and recalls due in the next 30 days. Booking one takes it off this list." />
      {listed.length === 0 ? (
        <EmptyState icon={BellRingIcon} title="Nothing due in the next 30 days">
          Signing a note for a procedure with a follow-up rule adds it here when it falls due.
        </EmptyState>
      ) : (
        SECTIONS.map(({ bucket, title, empty }) => {
          const rows = listed.filter((i) => dueBucket(i.dueOn, today) === bucket);
          return (
            <SectionCard key={bucket} title={`${title} (${rows.length})`}>
              {rows.length === 0 ? (
                <p className="text-sm text-ink-muted">{empty}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {rows.map((i) => {
                    const p = patients.find((x) => x.id === i.patientId);
                    const name = p ? `${p.lastName}, ${p.firstName}` : "Patient";
                    const phone = p?.guardians.find((g) => g.isPrimary)?.phone;
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/patients/${i.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
                            {name}
                          </Link>
                          <p className="text-sm text-ink-muted">
                            {what(i)} · due {formatDate(i.dueOn)}
                            {phone && <> · {formatPhone(phone)}</>}
                          </p>
                        </div>
                        <Button size="sm" onClick={() => book(i)} aria-label={`Book ${what(i).toLowerCase()} for ${name}`}>
                          Book
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          );
        })
      )}
      <AppointmentForm draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
