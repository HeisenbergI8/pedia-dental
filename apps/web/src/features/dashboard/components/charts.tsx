"use client";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatPeso } from "@pedia/shared";

export type Point = { label: string; amount: number };

/** Axis ticks only. Values people read use formatPeso. */
const tickPeso = (centavos: number) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 }).format(centavos / 100);
const AXIS = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: "var(--color-ink-muted)" } } as const;
const fill = (amount: number) => (amount < 0 ? "var(--color-chart-negative)" : "var(--color-chart-bar)");

/** The same numbers as a table, for screen readers. */
function DataTable({ caption, rows }: { caption: string; rows: Point[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{formatPeso(r.amount)}</td></tr>)}</tbody>
    </table>
  );
}

/** Collections over time: one bar per day, week or month. */
export function TimeBars({ data, caption }: { data: Point[]; caption: string }) {
  return (
    <div>
      <div className="h-64 overflow-hidden" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={12} />
            <YAxis {...AXIS} width={56} tickFormatter={tickPeso} />
            <Tooltip formatter={(v) => [formatPeso(Number(v)), "Collected"]} cursor={{ fill: "var(--color-brand-subtle)" }} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => <Cell key={d.label} fill={fill(d.amount)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={caption} rows={data} />
    </div>
  );
}

/** Ranked amounts (revenue by procedure, payment methods): horizontal bars labelled with their value. */
export function RankBars({ data, caption }: { data: Point[]; caption: string }) {
  return (
    <div>
      <div className="overflow-hidden" style={{ height: Math.max(120, data.length * 36) }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" {...AXIS} width={140} />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={18}>
              {data.map((d) => <Cell key={d.label} fill={fill(d.amount)} />)}
              <LabelList dataKey="amount" position="right" formatter={(v: unknown) => formatPeso(Number(v))} style={{ fontSize: 12, fill: "var(--color-ink)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable caption={caption} rows={data} />
    </div>
  );
}
