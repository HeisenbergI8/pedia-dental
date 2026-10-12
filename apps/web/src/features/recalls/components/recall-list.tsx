"use client";
import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { addDays, format, parseISO, setHours, startOfDay } from "date-fns";
import { BellRingIcon } from "lucide-react";
import { dueBucket, findFreeSlot, holdsRole, nextOpenStart, ruleLabel, type DueBucket, type DueItem } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { useAppointments } from "@/features/appointments/api";
import { AppointmentForm, type AppointmentDraft } from "@/features/appointments/components/appointment-form";
import { useActiveBranch, useBranchChairs, useBranchStaff, useProcedures } from "@/features/clinic/api";
import { useQueueDueMessage } from "@/features/messages/api";
import { usePatients } from "@/features/patients/api";
import { PatientName } from "@/features/patients/components/patient-name";
import { formatDate, formatPhone } from "@/lib/format";
import { useDueItems } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { MetaLine } from "@/components/meta-line";

const SECTIONS: { bucket: DueBucket; title: string; empty: string }[] = [
  { bucket: "overdue", title: "Overdue", empty: "Nothing overdue." },
  { bucket: "this_week", title: "Due this week", empty: "Nothing due in the next 7 days." },
  { bucket: "this_month", title: "Due this month", empty: "Nothing else due in the next 30 days." },
];

/** Follow-ups and recalls due within 30 days. Booking one opens the appointment form already filled in. */
export function RecallList() {
  const { data: items, isLoading, error, refetch, isRefetching } = useDueItems();
  const patientsQuery = usePatients();
  const patients = patientsQuery.data ?? [];
  const procedures = useProcedures().data ?? [];
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);
  const remind = useQueueDueMessage();
  const today = format(new Date(), "yyyy-MM-dd");
  // 30 days of due items plus a 14-day slot search. Strings from `today`, so the query key is stable across renders.
  const booked = useAppointments(startOfDay(parseISO(today)).toISOString(), addDays(parseISO(today), 45).toISOString());
  const chairs = useBranchChairs().data ?? [];
  const hours = useActiveBranch()?.openingHours;
  const dentists = useBranchStaff().filter((s) => holdsRole(s, "dentist")); // only dentists who work at this branch

  const procedureName = (code: string) => procedures.find((p) => p.code === code)?.name ?? code;
  /** "Follow-up after extraction" or "6-month recall", worded from the rule (shared with the appointment sheet). */
  const what = (i: DueItem) => ruleLabel(i.ruleId, procedureName) ?? "Recall";

  function book(i: DueItem) {
    if (!hours) return; // the button only shows once the page has loaded; this keeps the types honest
    const visitCode = i.kind === "follow_up" ? "follow_up" : "oral_exam";
    const durationMin = procedures.find((p) => p.code === visitCode)?.defaultDurationMin ?? 30;
    // 9 AM on the due day, never in the past, never outside clinic hours or on a closed day.
    const due = setHours(parseISO(i.dueOn), 9);
    const from = nextOpenStart(due < new Date() ? new Date() : due, hours, durationMin);
    // The child's dentist from the visit that made this due; any dentist if that's unknown.
    const dentistId = i.dentistId ?? dentists[0]?.id;
    const slot = dentistId && booked.data ? findFreeSlot({ from, durationMin, dentistId, chairIds: chairs.map((c) => c.id), hours }, booked.data) : undefined;
    setDraft({
      patientId: i.patientId,
      reason: what(i),
      durationMin,
      sourceRuleId: i.ruleId,
      procedureCode: visitCode,
      dentistId,
      chairId: slot?.chairId,
      start: slot?.startsAt ?? from, // no free slot in 14 days: the open slot, and the server's 409 explains a clash
    });
  }

  if (isLoading) return <Loading label="Loading recalls" />;
  if (error) return <ErrorState what="the recalls" onRetry={() => refetch()} retrying={isRefetching} />;
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
          // An empty group is one quiet line, not a whole card: the work queue stays what you see.
          if (rows.length === 0) {
            return (
              <p key={bucket} className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
                <span className="font-medium text-ink">{title}:</span> {empty}
              </p>
            );
          }
          return (
            <SectionCard key={bucket} title={`${title} (${rows.length})`}>
              {(
                <ul className="divide-y divide-line">
                  {rows.map((i) => {
                    const p = patients.find((x) => x.id === i.patientId);
                    // aria-labels need a string; the visible link uses PatientName.
                    const name = p ? `${p.lastName}, ${p.firstName}` : "this patient";
                    const phone = p?.guardians.find((g) => g.isPrimary)?.phone;
                    return (
                      <li key={i.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                        <div className="min-w-0 flex-1">
                          <Link href={`/patients/${i.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
                            <PatientName patient={p} loading={patientsQuery.isLoading} />
                          </Link>
                          <MetaLine
                            items={[
                              what(i),
                              `due ${formatDate(i.dueOn)}`,
                              phone && (
                                <a href={`tel:${phone}`} className="text-brand underline-offset-2 hover:underline">
                                  {formatPhone(phone)}
                                </a>
                              ),
                            ]}
                          />
                        </div>
                        {/* Full-width, thumb-sized buttons on a phone; inline from sm. */}
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={remind.isPending && remind.variables === i.id}
                            onClick={() =>
                              remind.mutate(i.id, {
                                onSuccess: (m) => toast.success(`Reminder queued for ${m.recipientName}`),
                                onError: (e) => toast.error(e.message),
                              })
                            }
                            aria-label={`Send reminder about ${what(i).toLowerCase()} for ${name}`}
                          >
                            Send reminder
                          </Button>
                          <Button size="sm" onClick={() => book(i)} aria-label={`Book ${what(i).toLowerCase()} for ${name}`}>
                            Book
                          </Button>
                        </div>
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
