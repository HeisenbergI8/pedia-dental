"use client";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AlertTriangleIcon, CakeIcon } from "lucide-react";
import type { MessageStatus, TodayAppointment } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/features/appointments/components/status-chip";
import { Can } from "@/features/auth/access";
import { cn } from "@/lib/utils";
import { useSendBirthdayGreeting, useTodaySummary } from "../api";
import { MixBars } from "./charts";

const GREETING_LABEL: Record<MessageStatus, string> = {
  queued: "Greeting queued",
  sent: "Greeting sent",
  failed: "Greeting failed",
  cancelled: "Greeting withdrawn",
};

/** Today's list on the calendar, narrowed to one STATUS_GROUPS group: the same rule as the count. */
const calendar = (today: string, status?: string) => `/appointments?date=${today}&view=agenda${status ? `&status=${status}` : ""}`;

/** A count that opens its list. Never a delta or a percentage: there is nothing honest to compare with. */
function Tile({ href, value, label, hint }: { href: string; value: number; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      aria-label={`${value} ${label.toLowerCase()}${hint ? `, ${hint}` : ""}`}
      className="block min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-(--duration-fast) hover:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="block text-2xl font-semibold tabular-nums">{value}</span>
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
    </Link>
  );
}

/** Cancelled and no-show rows are muted text under their own heading, never struck through. */
function Row({ a, muted }: { a: TodayAppointment; muted?: boolean }) {
  return (
    <li className={cn("flex items-start gap-3 py-3", muted && "text-ink-muted")}>
      <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold whitespace-nowrap tabular-nums">{format(parseISO(a.startsAt), "h:mm a")}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/patients/${a.patientId}`} className={cn("font-medium underline-offset-2 hover:underline", !muted && "text-brand")}>
          {a.patientName}
        </Link>
        <span className="block text-sm text-ink-muted">
          {a.reason}
          {a.dentistName && ` · ${a.dentistName}`}
        </span>
      </span>
      <StatusChip status={a.status} />
    </li>
  );
}

export function TodayGlance({ today }: { today: string }) {
  const { data: s, isLoading, error, refetch, isRefetching } = useTodaySummary(today);
  const greet = useSendBirthdayGreeting();
  if (error) return <ErrorState what="today's schedule" onRetry={() => refetch()} retrying={isRefetching} />;
  if (isLoading || !s) return <GlanceSkeleton />;

  const { counts: c } = s;
  const live = s.appointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const missed = s.appointments.filter((a) => a.status === "cancelled" || a.status === "no_show");
  const week = s.visitMix.reduce((t, d) => ({ new: t.new + d.new, returning: t.returning + d.returning }), { new: 0, returning: 0 });

  return (
    <div className="space-y-5">
      <nav aria-label="Today at a glance" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Tile href={calendar(today)} value={c.total} label="Appointments" hint={`${c.upcoming} still to come`} />
        <Tile
          href={calendar(today, "waiting")}
          value={c.waiting}
          label="Waiting"
          hint={c.inChair ? `${c.inChair} in the chair` : "Arrived, not in the chair"}
        />
        <Tile href={calendar(today, "done")} value={c.done} label="Done" />
        <Tile href={calendar(today, "missed")} value={c.missed} label="Cancelled or no-show" />
        <Can permission="appointments.manage">
          <Tile href={c.requests ? "/appointments#requests" : "/appointments"} value={c.requests} label="Booking requests" hint="From the parent portal" />
        </Can>
      </nav>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard className="min-w-0 lg:col-span-2" title={`Today's appointments (${s.appointments.length})`}>
          {s.appointments.length === 0 ? (
            <p className="text-sm text-ink-muted">No appointments booked today.</p>
          ) : (
            <>
              {live.length > 0 && (
                <ul className="divide-y divide-line">
                  {live.map((a) => (
                    <Row key={a.id} a={a} />
                  ))}
                </ul>
              )}
              {missed.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-ink-muted">Cancelled or no-show ({missed.length})</h3>
                  <ul className="divide-y divide-line">
                    {missed.map((a) => (
                      <Row key={a.id} a={a} muted />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </SectionCard>

        <div className="min-w-0 space-y-5">
          {s.birthdays.length > 0 && (
            <SectionCard title="Birthdays today">
              <ul className="divide-y divide-line">
                {s.birthdays.map((b) => (
                  <li key={b.patientId} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="min-w-0">
                      <Link href={`/patients/${b.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
                        {b.patientName}
                      </Link>
                      <span className="block text-sm text-ink-muted">Turning {b.turning}</span>
                    </span>
                    {b.greeting ? (
                      <span className={cn("inline-flex items-center gap-1 text-sm", b.greeting === "failed" ? "text-warning" : "text-ink-muted")}>
                        {b.greeting === "failed" ? <AlertTriangleIcon className="size-4" aria-hidden /> : <CakeIcon className="size-4" aria-hidden />}
                        {GREETING_LABEL[b.greeting]}
                      </span>
                    ) : (
                      <Can permission="messages.manage">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={greet.isPending}
                          onClick={() =>
                            greet.mutate(b.patientId, {
                              onSuccess: () => toast.success(`Birthday greeting queued for ${b.patientName}'s family`),
                              onError: (e) => toast.error(e.message),
                            })
                          }
                        >
                          <CakeIcon /> Send greeting
                        </Button>
                      </Can>
                    )}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
          <SectionCard
            title="New and returning this week"
            description={week.new + week.returning ? `${week.new} new · ${week.returning} returning` : undefined}
          >
            {week.new + week.returning === 0 ? (
              <p className="text-sm text-ink-muted">No visits yet this week.</p>
            ) : (
              <MixBars
                caption="Children seen each day this week, new and returning"
                data={s.visitMix.map((d) => ({ label: format(parseISO(d.date), "EEE"), new: d.new, returning: d.returning }))}
              />
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/** Shaped like the content (DESIGN_SYSTEM §8 Loading): five tiles, a list card, a side card. */
function GlanceSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading today's schedule">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard className="min-w-0 lg:col-span-2" title="Today's appointments">
          <Loading rows={4} label="Loading today's appointments…" />
        </SectionCard>
        <SectionCard className="min-w-0" title="New and returning this week">
          <Skeleton className="h-40" />
        </SectionCard>
      </div>
    </div>
  );
}
