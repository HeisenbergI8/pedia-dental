"use client";
import type { ReactNode } from "react";
import { rulesFor, formatPeso, type FollowUpRule } from "@pedia/shared";
import { DataList } from "@/components/data-list";
import { PageHeader } from "@/components/page-header";
import { useChairs, useProcedures, useStaff } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const ROLE_LABEL = { admin: "Admin", dentist: "Dentist", front_desk: "Front desk" } as const;

function describeRule(rule: FollowUpRule | undefined) {
  if (!rule) return "No follow-up";
  const { days, months } = rule.interval;
  const after = months ? `${months} months` : `${days} days`;
  return rule.kind === "recall" ? `Recall in ${after}` : `Follow-up in ${after}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Read-only view of the clinic's reference data. Everyone but the Owner sees it as Settings; the Owner sees it as a
 * tab of theirs (`embedded`: no page header).
 */
export function ClinicSettings({ embedded = false }: { embedded?: boolean }) {
  const procedures = useProcedures();
  const staff = useStaff();
  const chairs = useChairs();

  if (procedures.isLoading || staff.isLoading || chairs.isLoading) {
    return <Loading label="Loading settings" />;
  }
  if (procedures.error || staff.error || chairs.error) {
    return <ErrorState what="the settings" onRetry={() => [procedures, staff, chairs].forEach((q) => q.refetch())} />;
  }

  return (
    <div className="space-y-6">
      {!embedded && <PageHeader title="Settings" description="The clinic's procedures, staff and chairs. Read-only in this prototype." />}

      <Section title="Procedure catalog">
        <DataList
          caption="Procedure catalog"
          rows={procedures.data ?? []}
          rowKey={(p) => p.code}
          columns={[
            {
              key: "name",
              header: "Procedure",
              mobile: "title",
              cell: (p) => (
                <>
                  {p.name}
                  <span className="block font-mono text-xs font-normal text-ink-muted">{p.code}</span>
                </>
              ),
            },
            {
              key: "fee",
              header: "Fee",
              mobile: "trailing",
              numeric: true,
              cell: (p) => (
                <>
                  {formatPeso(p.fee)}
                  {p.perTooth && <span className="block text-xs text-ink-muted">per tooth</span>}
                </>
              ),
            },
            { key: "duration", header: "Duration", mobile: "meta", numeric: true, cell: (p) => `${p.defaultDurationMin} min` },
            {
              key: "followUp",
              header: "Follow-up",
              mobile: "meta",
              // Every rule for the code, conditional ones first: "Recall in 3 months at high caries risk; Recall in 6 months".
              cell: (p) => rulesFor(p.code).map((r) => `${describeRule(r)}${r.when ? ` at ${r.when.label}` : ""}`).join("; ") || describeRule(undefined),
            },
          ]}
        />
      </Section>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <Section title="Dentists and staff">
          <DataList
            caption="Dentists and staff"
            rows={staff.data ?? []}
            rowKey={(s) => s.id}
            columns={[
              { key: "name", header: "Name", mobile: "title", cell: (s) => s.fullName },
              { key: "role", header: "Role", mobile: "meta", cell: (s) => ROLE_LABEL[s.role] },
              { key: "license", header: "PRC license", mobile: "meta", cell: (s) => (s.licenseNo ? `PRC ${s.licenseNo}` : "No license on file") },
            ]}
          />
        </Section>

        <Section title="Chairs">
          <DataList caption="Chairs" rows={chairs.data ?? []} rowKey={(c) => c.id} columns={[{ key: "name", header: "Name", mobile: "title", cell: (c) => c.name }]} />
        </Section>
      </div>
    </div>
  );
}
