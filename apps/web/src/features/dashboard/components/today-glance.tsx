"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AlertTriangleIcon, CakeIcon } from "lucide-react";
import type { MessageStatus, TodayAppointment, TodaySummary } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentRequests } from "@/features/appointments/components/appointment-requests";
import { StatusChip } from "@/features/appointments/components/status-chip";
import { Can, useCan, useSession } from "@/features/auth/access";
import { firstName } from "@/lib/format";
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

const greeting = (now: Date) => (now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening");

/**
 * One stat on the banner: a count that opens its list. Never a delta or a percentage: there is nothing honest to
 * compare with. Glass on brand-deep, the same in both themes; focus is a light ring (a brand ring would vanish here).
 */
function Cell({ href, value, label, hint }: { href: string; value: number; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      aria-label={`${value} ${label.toLowerCase()}${hint ? `, ${hint}` : ""}`}
      className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border border-on-deep/10 bg-on-deep/7 p-3 transition-colors sm:gap-2 sm:p-3.5 duration-(--duration-fast) hover:bg-on-deep/12 focus-visible:ring-[3px] focus-visible:ring-on-deep/60 focus-visible:outline-none"
    >
      <span className="text-xs font-semibold text-on-deep-label sm:text-sm">{label}</span>
      <span className="font-title text-2xl leading-none font-semibold tracking-tight text-on-deep tabular-nums sm:text-3xl">{value}</span>
      {/* Phones keep the banner short: the hint is still in the aria-label. */}
      {hint && <span className="hidden text-xs text-on-deep-muted sm:block">{hint}</span>}
    </Link>
  );
}

/** The top of Today: date, who is here, one line of what matters, and the counts. Renders its h1 in every state. */
function Banner({ now, summary, cells, children }: { now: Date; summary?: string; cells: number; children?: ReactNode }) {
  const name = useSession()?.user.name;
  return (
    <section
      aria-labelledby="today-title"
      className="relative overflow-hidden rounded-3xl bg-brand-deep bg-[radial-gradient(520px_260px_at_92%_-30%,var(--color-brand-glow),transparent_70%)] p-5 shadow-banner sm:p-7 xl:flex xl:items-end xl:justify-between xl:gap-8"
    >
      <div className="relative space-y-2">
        <p className="text-xs font-semibold tracking-[0.06em] text-on-deep-label uppercase">{format(now, "EEEE, d MMMM")}</p>
        <h1 id="today-title" className="text-2xl leading-tight font-semibold text-on-deep sm:text-3xl lg:text-4xl">
          {name ? `${greeting(now)}, ${firstName(name)}` : "Today"}
        </h1>
        {summary && <p className="text-on-deep-muted">{summary}</p>}
      </div>
      {children && (
        <nav
          aria-label="Today at a glance"
          className={cn("relative mt-5 grid grid-cols-3 gap-2 sm:gap-2.5 xl:mt-0 xl:shrink-0", cells > 4 ? "xl:w-[44rem] xl:grid-cols-5" : "xl:w-[35rem] xl:grid-cols-4")}
        >
          {children}
        </nav>
      )}
    </section>
  );
}

/** One line under the greeting, from today's counts only. Never a comparison with another day. */
function summaryLine(c: TodaySummary["counts"], seesRequests: boolean) {
  const day = c.total === 0 ? "No appointments booked today." : `${c.upcoming} still to come, ${c.waiting} waiting.`;
  const calls = seesRequests && c.requests > 0 ? ` ${c.requests} booking request${c.requests === 1 ? "" : "s"} need${c.requests === 1 ? "s" : ""} a call back.` : "";
  return day + calls;
}

/** Cancelled and no-show rows are muted text under their own heading, never struck through. */
function Row({ a, muted }: { a: TodayAppointment; muted?: boolean }) {
  return (
    <li className={cn("flex items-start gap-3 py-3", muted && "text-ink-muted")}>
      <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold whitespace-nowrap tabular-nums">{format(parseISO(a.startsAt), "h:mm a")}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/patients/${a.patientId}`} className={cn("font-semibold underline-offset-2 hover:underline", !muted && "text-ink")}>
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

export function TodayGlance({ today, now }: { today: string; now: Date }) {
  const { data: s, isLoading, error, refetch, isRefetching } = useTodaySummary(today);
  const greet = useSendBirthdayGreeting();
  const can = useCan();
  const seesRequests = can("appointments.manage");
  if (error)
    return (
      <div className="space-y-5">
        <Banner now={now} cells={0} />
        <ErrorState what="today's schedule" onRetry={() => refetch()} retrying={isRefetching} />
      </div>
    );
  if (isLoading || !s) return <GlanceSkeleton now={now} cells={seesRequests ? 5 : 4} />;

  const { counts: c } = s;
  const live = s.appointments.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const missed = s.appointments.filter((a) => a.status === "cancelled" || a.status === "no_show");
  const week = s.visitMix.reduce((t, d) => ({ new: t.new + d.new, returning: t.returning + d.returning }), { new: 0, returning: 0 });

  return (
    <div className="space-y-5">
      <Banner now={now} summary={summaryLine(c, seesRequests)} cells={seesRequests ? 5 : 4}>
        <Cell href={calendar(today)} value={c.total} label="Appointments" hint={`${c.upcoming} still to come`} />
        <Cell
          href={calendar(today, "waiting")}
          value={c.waiting}
          label="Waiting"
          hint={c.inChair ? `${c.inChair} in the chair` : "Arrived, not in the chair"}
        />
        <Cell href={calendar(today, "done")} value={c.done} label="Done" />
        <Cell href={calendar(today, "missed")} value={c.missed} label="Cancelled or no-show" />
        <Can permission="appointments.manage">
          <Cell href={c.requests ? "/appointments#requests" : "/appointments"} value={c.requests} label="Booking requests" hint="From the parent portal" />
        </Can>
      </Banner>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
        {/* The same requests list as Appointments, with its own Book and Mark handled: nothing new, just closer. */}
        <Can permission="appointments.manage">
          <AppointmentRequests look="card" />
        </Can>
        <SectionCard className="min-w-0" title={`Today's appointments (${s.appointments.length})`}>
          {s.appointments.length === 0 ? (
            <p className="text-sm text-ink-muted">No appointments booked today.</p>
          ) : (
            <>
              {live.length > 0 && (
                <ul className="divide-y divide-line-soft">
                  {live.map((a) => (
                    <Row key={a.id} a={a} />
                  ))}
                </ul>
              )}
              {missed.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-ink-muted">Cancelled or no-show ({missed.length})</h3>
                  <ul className="divide-y divide-line-soft">
                    {missed.map((a) => (
                      <Row key={a.id} a={a} muted />
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </SectionCard>
        </div>

        <div className="min-w-0 space-y-5">
          {s.birthdays.length > 0 && (
            <SectionCard title="Birthdays today">
              <ul className="space-y-2">
                {s.birthdays.map((b) => (
                  // Sunny: celebrations only, never status.
                  <li key={b.patientId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunny p-2.5 pl-3">
                    <span className="min-w-0">
                      <Link href={`/patients/${b.patientId}`} className="font-bold text-ink underline-offset-2 hover:underline">
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

/** Shaped like the content (DESIGN_SYSTEM §8 Loading): the banner and its cells, a list card, a side card. */
function GlanceSkeleton({ now, cells }: { now: Date; cells: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading today's schedule">
      <Banner now={now} cells={cells}>
        {Array.from({ length: cells }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-[14px] bg-on-deep/7" />
        ))}
      </Banner>
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
