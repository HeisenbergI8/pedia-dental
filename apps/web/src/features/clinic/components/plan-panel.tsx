"use client";
import type { ReactNode } from "react";
import { TIER_LABEL, TIER_LIMITS, type ClinicUsage } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { useClinicUsage } from "../api";

/** Read-only: the operator sets the tier (decision #4). What is in use against the plan, and what the plan includes. */
export function PlanPanel() {
  const usage = useClinicUsage();
  if (usage.isLoading) return <Loading label="Loading your plan" />;
  if (!usage.data) return <ErrorState what="your plan" onRetry={() => void usage.refetch()} />;
  const { tier } = usage.data;
  const limits = TIER_LIMITS[tier];

  return (
    <SectionCard title={<>You&apos;re on the {TIER_LABEL[tier]} plan</>} description="To change your plan, contact Primolar.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Allowance label="Open branches" allowance={usage.data.branches} />
        <Allowance label="Staff logins" allowance={usage.data.staffLogins} />
      </div>
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Also on your plan</h3>
        <ul className="space-y-1 text-sm">
          <Feature on>Your logo, brand colour and heading font</Feature>
          <Feature on={limits.crossBranchViews}>Dashboard and finance views across branches</Feature>
        </ul>
      </div>
    </SectionCard>
  );
}

/** "2 of 3", a meter, and over the limit after a downgrade, what that means (decision #9). Never colour alone. */
function Allowance({ label, allowance: { inUse, limit } }: { label: string; allowance: ClinicUsage["branches"] }) {
  const over = limit !== null && inUse > limit;
  return (
    <div className="space-y-2 rounded-lg border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm tabular-nums">{limit === null ? `${inUse} (unlimited)` : `${inUse} of ${limit}`}</p>
      </div>
      {limit !== null && (
        <meter aria-label={`${label} in use`} min={0} max={limit} value={Math.min(inUse, limit)} className="h-2 w-full accent-brand" />
      )}
      {over && <p className="text-sm text-ink-muted">Everything keeps working. You can&apos;t add more until you&apos;re under the limit.</p>}
    </div>
  );
}

function Feature({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <li className={on ? "text-ink" : "text-ink-muted"}>
      {children}
      <span className="text-ink-muted">{on ? " · included" : " · not on this plan"}</span>
    </li>
  );
}
