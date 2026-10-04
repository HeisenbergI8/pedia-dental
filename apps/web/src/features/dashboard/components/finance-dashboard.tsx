"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ReceiptIcon } from "lucide-react";
import { formatPeso } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { METHOD_LABEL } from "@/features/billing/api";
import { useProcedures } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { formatDate } from "@/lib/format";
import { useFinanceSummary } from "../api";
import { RankBars, TimeBars } from "./charts";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { DataList } from "@/components/data-list";

const PERIODS = { day: "Last 14 days", week: "Last 8 weeks", month: "Last 6 months" } as const;
type Period = keyof typeof PERIODS;
const tick: Record<Period, string> = { day: "MMM d", week: "'Wk of' MMM d", month: "MMM yyyy" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 bg-surface p-4 sm:p-5">
      <dt className="text-sm text-ink-muted">{label}</dt>
      {/* Two tiles share a 360px row: the figure steps down a size there so ₱34,550.00 fits. */}
      <dd className="mt-1 font-title text-xl font-semibold tracking-tight break-words tabular-nums sm:text-2xl">{value}</dd>
      {hint && <dd className="text-xs text-ink-muted">{hint}</dd>}
    </div>
  );
}


/** The admin's money view. Rendered inside <Can permission="dashboard.view"> by DashboardScreen. */
export function FinanceDashboard({ today }: { today: string }) {
  const { data: s, isLoading, error, refetch, isRefetching } = useFinanceSummary(today, true);
  const patients = usePatients().data ?? [];
  const procedures = useProcedures().data ?? [];
  const [period, setPeriod] = useState<Period>("day");
  const [allUnpaid, setAllUnpaid] = useState(false);
  const [allOwing, setAllOwing] = useState(false);
  const header = (
    <div className="space-y-0.5 pt-2">
      <h2 className="text-lg font-semibold">Finance</h2>
      <p className="text-sm text-ink-muted">Computed from invoices and payments as of {formatDate(today)}. Collections are net of refunds.</p>
    </div>
  );

  if (isLoading) return <section aria-label="Finance" className="space-y-5">{header}<Loading label="Loading the finance figures…" /></section>;
  if (error || !s) return <section aria-label="Finance" className="space-y-5">{header}<ErrorState what="the finance figures" onRetry={() => refetch()} retrying={isRefetching} /></section>;

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
    <section aria-label="Finance" className="space-y-5">
      {header}
      {/* One strip: a gap-px grid over a line background draws the dividers at every column count. */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card lg:grid-cols-4">
        <Tile label="Collected today" value={formatPeso(s.collected.today)} />
        <Tile label="This week" value={formatPeso(s.collected.week)} hint="Since Monday" />
        <Tile label="This month" value={formatPeso(s.collected.month)} hint={`Since ${format(parseISO(today), "MMM 1")}`} />
        <Tile label="Outstanding" value={formatPeso(s.outstandingTotal)} hint={`${owing} owe${s.outstanding.length === 1 ? "s" : ""} a balance`} />
      </dl>

      <SectionCard
        title="Collections"
        description={`${PERIODS[period]} · ${formatPeso(seriesTotal)} in total`}
        action={
          <Segmented
            label="Group collections by"
            value={period}
            onChange={setPeriod}
            options={(Object.keys(PERIODS) as Period[]).map((p) => ({ value: p, label: { day: "Day", week: "Week", month: "Month" }[p] }))}
          />
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
            <DataList
              bare
              caption="Outstanding balances, largest first"
              rows={allOwing ? s.outstanding : s.outstanding.slice(0, 10)}
              rowKey={(r) => r.patientId}
              columns={[
                { key: "patient", header: "Patient", mobile: "title", cell: (r) => patientLink(r.patientId) },
                { key: "balance", header: "Balance", mobile: "trailing", numeric: true, cell: (r) => formatPeso(r.balance) },
              ]}
            />
          )}
          {s.outstanding.length > 10 && (
            <Button variant="outline" size="sm" onClick={() => setAllOwing((v) => !v)}>
              {allOwing ? "Show fewer" : `Show all ${s.outstanding.length}`}
            </Button>
          )}
        </SectionCard>
        <SectionCard title={`Unpaid appointments (${s.unpaidAppointments.length})`} description="Done in the last 30 days, and not billed or not fully paid">
          {s.unpaidAppointments.length === 0 ? (
            <p className="text-sm text-ink-muted">Every recent appointment is billed and paid.</p>
          ) : (
            <DataList
              bare
              caption="Unpaid appointments, last 30 days"
              rows={allUnpaid ? s.unpaidAppointments : s.unpaidAppointments.slice(0, 10)}
              rowKey={(a) => a.appointmentId}
              columns={[
                { key: "date", header: "Date", mobile: "meta", className: "whitespace-nowrap tabular-nums", cell: (a) => format(parseISO(a.startsAt), "MMM d") },
                { key: "patient", header: "Patient", mobile: "title", cell: (a) => patientLink(a.patientId) },
                { key: "reason", header: "Reason", mobile: "meta", cell: (a) => a.reason },
                {
                  key: "owed",
                  header: "Owed",
                  mobile: "trailing",
                  numeric: true,
                  cell: (a) =>
                    a.balance === undefined ? (
                      // An operational warning, not a clinical alert: amber, with an icon.
                      <span className="inline-flex items-center gap-1 font-medium text-warning">
                        <ReceiptIcon className="size-3.5" aria-hidden /> Not billed
                      </span>
                    ) : (
                      formatPeso(a.balance)
                    ),
                },
              ]}
            />
          )}
          {s.unpaidAppointments.length > 10 && (
            <Button variant="outline" size="sm" onClick={() => setAllUnpaid((v) => !v)}>
              {allUnpaid ? "Show fewer" : `Show all ${s.unpaidAppointments.length}`}
            </Button>
          )}
        </SectionCard>
      </div>
    </section>
  );
}
