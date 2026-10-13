"use client";
import { useState } from "react";
import Link from "next/link";
import { InboxIcon } from "lucide-react";
import { BRANDING_CHOICE_LABEL, TIER_LABEL, formatPeso, type Signup, type SignupStatus } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList } from "@/components/data-list";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Segmented } from "@/components/segmented";
import { useSignups } from "../api";
import { SignupBadge } from "./signup-badge";

const GROUP_LABEL: Record<SignupStatus, string> = { waiting: "Waiting", approved: "Approved", rejected: "Rejected" };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });

/** Billing #12–#14: every sign-up, by state. Form and console sign-ups alike (A5); console ones arrive approved. */
export function SignupsScreen() {
  const signups = useSignups();
  const [group, setGroup] = useState<SignupStatus>("waiting");
  const rows = signups.data?.filter((s) => s.status === group) ?? [];
  const count = (g: SignupStatus) => signups.data?.filter((s) => s.status === g).length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Sign-ups" description="Clinics that asked to join. Record the payment, then approve, fix or reject." />
      <Segmented
        label="Show sign-ups"
        value={group}
        onChange={setGroup}
        options={(["waiting", "approved", "rejected"] as const).map((g) => ({ value: g, label: `${GROUP_LABEL[g]} (${count(g)})` }))}
      />
      {signups.isLoading && <Loading label="Loading sign-ups" />}
      {signups.error && <ErrorState what="the sign-ups" onRetry={() => void signups.refetch()} />}
      {signups.data && rows.length === 0 && <EmptyState icon={InboxIcon} title={`No ${GROUP_LABEL[group].toLowerCase()} sign-ups`} />}
      {rows.length > 0 && (
        <DataList
          caption={`${GROUP_LABEL[group]} sign-ups`}
          rows={rows}
          rowKey={(s) => s.id}
          columns={[
            {
              key: "clinic",
              header: "Clinic",
              mobile: "title",
              cell: (s: Signup) => (
                <Link href={`/operator/signups/${s.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                  {s.account.name}
                </Link>
              ),
            },
            { key: "status", header: "Status", mobile: "trailing", cell: (s) => <SignupBadge signup={s} /> },
            { key: "plan", header: "Plan", mobile: "meta", cell: (s) => TIER_LABEL[s.account.tier] },
            { key: "look", header: "Look", mobile: "meta", cell: (s) => BRANDING_CHOICE_LABEL[s.branding.choice] },
            { key: "due", header: "Amount", mobile: "meta", numeric: true, cell: (s) => formatPeso(s.quote.total) },
            { key: "when", header: "Submitted", mobile: "meta", cell: (s) => `${day(s.submittedAt)}${s.source === "console" ? " · console" : ""}` },
          ]}
        />
      )}
    </div>
  );
}
