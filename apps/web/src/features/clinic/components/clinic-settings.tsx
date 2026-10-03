"use client";
import type { ReactNode } from "react";
import { findRule, formatPeso, type FollowUpRule } from "@pedia/shared";
import { PageHeader } from "@/components/page-header";
import { useChairs, useProcedures, useStaff } from "../api";

const ROLE_LABEL = { admin: "Admin", dentist: "Dentist", front_desk: "Front desk" } as const;

function describeRule(rule: FollowUpRule | undefined) {
  if (!rule) return "—";
  const { days, months } = rule.interval;
  const after = months ? `${months} months` : `${days} days`;
  return rule.kind === "recall" ? `Recall in ${after}` : `Follow-up in ${after}`;
}

/** Columns named in `numeric` are right-aligned, so amounts line up. */
function Table({ title, head, numeric = [], children }: { title: string; head: string[]; numeric?: string[]; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-ground/60 text-ink-muted">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className={`px-4 py-2.5 font-medium ${numeric.includes(h) ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:px-4 [&_td]:py-2.5 [&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0">
            {children}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Read-only view of the clinic's reference data. Editing comes later if the clinic needs it. */
export function ClinicSettings() {
  const procedures = useProcedures();
  const staff = useStaff();
  const chairs = useChairs();

  if (procedures.isLoading || staff.isLoading || chairs.isLoading) {
    return <p className="text-ink-muted">Loading settings…</p>;
  }
  if (procedures.error || staff.error || chairs.error) {
    return <p className="text-danger">Couldn&apos;t load settings. Refresh to try again.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="The clinic's procedures, staff and chairs. Read-only in this prototype." />

      <Table title="Procedure catalog" head={["Procedure", "Duration", "Fee", "Follow-up"]} numeric={["Duration", "Fee"]}>
        {procedures.data?.map((p) => (
          <tr key={p.code}>
            <td>
              {p.name}
              <span className="block font-mono text-xs text-ink-muted">{p.code}</span>
            </td>
            <td className="text-right whitespace-nowrap tabular-nums">{p.defaultDurationMin} min</td>
            <td className="text-right whitespace-nowrap tabular-nums">
              {formatPeso(p.fee)}
              {p.perTooth && <span className="block text-xs text-ink-muted">per tooth</span>}
            </td>
            <td>{describeRule(findRule(p.code))}</td>
          </tr>
        ))}
      </Table>

      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <Table title="Dentists and staff" head={["Name", "Role", "PRC license"]}>
          {staff.data?.map((s) => (
            <tr key={s.id}>
              <td>{s.fullName}</td>
              <td>{ROLE_LABEL[s.role]}</td>
              <td>{s.licenseNo ?? "—"}</td>
            </tr>
          ))}
        </Table>

        <Table title="Chairs" head={["Name"]}>
          {chairs.data?.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}
