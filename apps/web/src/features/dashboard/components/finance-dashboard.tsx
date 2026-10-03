"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { LockIcon } from "lucide-react";
import { formatPeso } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { METHOD_LABEL } from "@/features/billing/api";
import { useCan } from "@/features/auth/access";
import { useProcedures } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { useFinanceSummary } from "../api";
import { RankBars, TimeBars } from "./charts";

const PERIODS = { day: "Last 14 days", week: "Last 8 weeks", month: "Last 6 months" } as const;
type Period = keyof typeof PERIODS;
const tick: Record<Period, string> = { day: "MMM d", week: "'Wk of' MMM d", month: "MMM yyyy" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-ink-muted">{hint}</dd>}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-ink-muted">
          <tr>{head.map((h, i) => <th key={h} scope="col" className={i === head.length - 1 ? "py-2 text-right font-medium" : "py-2 pr-3 font-medium"}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function FinanceDashboard() {
  const isAdmin = useCan()("dashboard.view");
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: s, isLoading, error } = useFinanceSummary(today, isAdmin);
  const patients = usePatients().data ?? [];
  const procedures = useProcedures().data ?? [];
  const [period, setPeriod] = useState<Period>("day");
  const header = <PageHeader title="Dashboard" description={`Computed from invoices and payments as of ${formatDate(today)}. Collections are net of refunds.`} />;

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        {header}
        <EmptyState icon={LockIcon} title="The dashboard is for clinic admins">
          {env.apiMocking ? "Sign in as the clinic admin to see it." : "Ask a clinic admin for these figures."}
        </EmptyState>
      </div>
    );
  }
  if (isLoading) return <div className="space-y-5">{header}<p className="text-ink-muted">Loading the dashboard…</p></div>;
  if (error || !s) return <div className="space-y-5">{header}<p className="text-danger">Couldn&apos;t load the dashboard. Refresh to try again.</p></div>;

  const patientLink = (id: string) => {
    const p = patients.find((x) => x.id === id);
    return <Link href={`/patients/${id}`} className="text-brand underline-offset-2 hover:underline">{p ? `${p.lastName}, ${p.firstName}` : "Patient"}</Link>;
  };
  const buckets = { day: s.byDay, week: s.byWeek, month: s.byMonth }[period];
  const series = buckets.map((b) => ({ label: format(parseISO(b.start), tick[period]), amount: b.amount }));
  const seriesTotal = series.reduce((t, b) => t + b.amount, 0);
  const revenue = s.revenueByProcedure.map((r) => ({ label: procedures.find((p) => p.code === r.procedureCode)?.name ?? r.procedureCode, amount: r.amount }));
  const methods = s.byMethod.filter((m) => m.amount !== 0).map((m) => ({ label: METHOD_LABEL[m.method], amount: m.amount }));
  const owing = `${s.outstanding.length} patient${s.outstanding.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-5">
      {header}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Collected today" value={formatPeso(s.collected.today)} />
        <Tile label="This week" value={formatPeso(s.collected.week)} hint="Since Monday" />
        <Tile label="This month" value={formatPeso(s.collected.month)} hint={`Since ${format(parseISO(today), "MMM 1")}`} />
        <Tile label="Outstanding" value={formatPeso(s.outstandingTotal)} hint={`${owing} owe${s.outstanding.length === 1 ? "s" : ""} a balance`} />
      </dl>

      <SectionCard
        title="Collections"
        description={`${PERIODS[period]} · ${formatPeso(seriesTotal)} in total`}
        action={
          <div role="group" aria-label="Group collections by" className="flex gap-1">
            {(Object.keys(PERIODS) as Period[]).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "outline"} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {{ day: "Day", week: "Week", month: "Month" }[p]}
              </Button>
            ))}
          </div>
        }
      >
        <TimeBars data={series} caption={`Collections, ${PERIODS[period].toLowerCase()}`} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Revenue by procedure" description={`Invoiced this month, before ${formatPeso(s.discounts)} in discounts`}>
          {revenue.length ? <RankBars data={revenue} caption="Revenue by procedure, this month" /> : <p className="text-sm text-ink-muted">Nothing invoiced this month yet.</p>}
        </SectionCard>
        <SectionCard title="Payment methods" description="Collected this month, net of refunds">
          {methods.length ? <RankBars data={methods} caption="Collections by payment method, this month" /> : <p className="text-sm text-ink-muted">Nothing collected this month yet.</p>}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Outstanding balances" description={`${formatPeso(s.outstandingTotal)} across ${owing}, largest first`}>
          {s.outstanding.length === 0 ? (
            <p className="text-sm text-ink-muted">No one owes a balance.</p>
          ) : (
            <Table head={["Patient", "Balance"]}>
              {s.outstanding.slice(0, 10).map((r) => (
                <tr key={r.patientId}>
                  <td className="py-2 pr-3">{patientLink(r.patientId)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPeso(r.balance)}</td>
                </tr>
              ))}
            </Table>
          )}
          {s.outstanding.length > 10 && <p className="text-sm text-ink-muted">and {s.outstanding.length - 10} more</p>}
        </SectionCard>
        <SectionCard title={`Unpaid appointments (${s.unpaidAppointments.length})`} description="Done in the last 30 days, and not billed or not fully paid">
          {s.unpaidAppointments.length === 0 ? (
            <p className="text-sm text-ink-muted">Every recent appointment is billed and paid.</p>
          ) : (
            <Table head={["Date", "Patient", "Reason", "Owed"]}>
              {s.unpaidAppointments.map((a) => (
                <tr key={a.appointmentId}>
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{format(parseISO(a.startsAt), "MMM d")}</td>
                  <td className="py-2 pr-3">{patientLink(a.patientId)}</td>
                  <td className="py-2 pr-3">{a.reason}</td>
                  <td className="py-2 text-right tabular-nums">{a.balance === undefined ? <span className="text-alert">Not billed</span> : formatPeso(a.balance)}</td>
                </tr>
              ))}
            </Table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
