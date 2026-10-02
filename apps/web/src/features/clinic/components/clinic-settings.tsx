"use client";
import type { ReactNode } from "react";
import { findRule, formatPeso, type FollowUpRule } from "@pedia/shared";
import { useChairs, useProcedures, useStaff } from "../api";

const ROLE_LABEL = { admin: "Admin", dentist: "Dentist", front_desk: "Front desk" } as const;

function describeRule(rule: FollowUpRule | undefined) {
  if (!rule) return "—";
  const { days, months } = rule.interval;
  const after = months ? `${months} months` : `${days} days`;
  return rule.kind === "recall" ? `Recall in ${after}` : `Follow-up in ${after}`;
}

function Table({ title, head, children }: { title: string; head: string[]; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="[&_td]:px-4 [&_td]:py-3 [&_tr]:border-b [&_tr]:border-line [&_tr:last-child]:border-0">
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
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Table title="Procedure catalog" head={["Code", "Procedure", "Duration", "Fee", "Follow-up"]}>
        {procedures.data?.map((p) => (
          <tr key={p.code}>
            <td className="font-mono text-xs text-ink-muted">{p.code}</td>
            <td>{p.name}</td>
            <td>{p.defaultDurationMin} min</td>
            <td>
              {formatPeso(p.fee)}
              {p.perTooth && <span className="text-ink-muted"> per tooth</span>}
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
