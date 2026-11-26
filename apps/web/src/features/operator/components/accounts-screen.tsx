"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, PlusIcon } from "lucide-react";
import { TIER_LABEL, TIER_SUPPORT, type AccountOverview } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList } from "@/components/data-list";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAccounts, useReceiptsToCheck, useSignups } from "../api";
import { allowance } from "./allowance";
import { CreateAccountDialog } from "./create-account-dialog";
import { StatusBadge } from "./status-badge";

/** Every clinic account with its tier, Owner and usage counts (decision #25). Counts only: never a patient record. */
export function AccountsScreen() {
  const accounts = useAccounts();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clinic accounts"
        description="Every clinic on Primolar, its plan and how much of it is in use."
        actions={
          <Button onClick={() => setCreating(true)}>
            <PlusIcon aria-hidden /> New clinic account
          </Button>
        }
      />
      <ToDo accounts={accounts.data} />
      {accounts.isLoading && <Loading label="Loading clinic accounts" />}
      {accounts.error && <ErrorState what="the clinic accounts" onRetry={() => void accounts.refetch()} />}
      {accounts.data && (
        <DataList
          caption="Clinic accounts"
          rows={accounts.data}
          rowKey={(r) => r.account.id}
          columns={[
            {
              key: "clinic",
              header: "Clinic",
              mobile: "title",
              cell: (r) => (
                <Link href={`/operator/accounts/${r.account.id}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                  {r.account.name}
                </Link>
              ),
            },
            { key: "status", header: "Status", mobile: "trailing", cell: (r) => <StatusBadge status={r.account.status} /> },
            { key: "tier", header: "Plan", mobile: "meta", cell: (r) => TIER_LABEL[r.account.tier] },
            { key: "support", header: "Support", mobile: "detail", cell: (r) => TIER_SUPPORT[r.account.tier].label },
            { key: "owner", header: "Owner", mobile: "meta", cell: (r) => <Owner row={r} /> },
            { key: "branches", header: "Branches", mobile: "detail", numeric: true, cell: (r) => <Use row={r} limit="branches" /> },
            { key: "staff", header: "Staff logins", mobile: "detail", numeric: true, cell: (r) => <Use row={r} limit="staffLogins" /> },
            { key: "patients", header: "Patients", mobile: "detail", numeric: true, cell: (r) => r.usage.patients },
          ]}
        />
      )}
      {creating && <CreateAccountDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

/** What needs the operator today, before the list: each count links to where it is done. */
function ToDo({ accounts }: { accounts?: AccountOverview[] }) {
  const receipts = useReceiptsToCheck().data;
  const signups = useSignups().data;
  if (!receipts || !signups || !accounts) return null;
  const items = [
    { href: "/operator/payments", count: receipts.length, one: "payment to check", many: "payments to check" },
    { href: "/operator/signups", count: signups.filter((s) => s.status === "waiting").length, one: "sign-up waiting", many: "sign-ups waiting" },
    { href: "/operator", count: accounts.filter((a) => a.account.status === "suspended").length, one: "clinic paused", many: "clinics paused", quiet: true },
    { href: "/operator", count: accounts.filter((a) => a.design === "in_progress").length, one: "design to deliver", many: "designs to deliver", quiet: true },
  ].filter((i) => i.count > 0);
  return (
    <section aria-labelledby="todo" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 id="todo" className="text-base font-semibold">To do</h2>
      {items.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-ink-muted">
          <CheckCircle2Icon aria-hidden className="size-4 text-success" /> Nothing waiting. New receipts and sign-ups show here.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((i) =>
            i.quiet ? (
              <li key={i.one} className="flex min-h-11 items-center gap-3 rounded-xl bg-ground px-3 text-sm">
                <span className="text-lg font-semibold tabular-nums">{i.count}</span> {i.count === 1 ? i.one : i.many}
              </li>
            ) : (
              <li key={i.one}>
                <Link href={i.href} className="flex min-h-11 items-center gap-3 rounded-xl border border-brand-ring bg-brand-subtle px-3 text-sm font-semibold text-brand-tint-ink hover:border-brand">
                  <span className="text-lg tabular-nums">{i.count}</span> {i.count === 1 ? i.one : i.many}
                  <span aria-hidden className="ml-auto text-brand">→</span>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function Owner({ row }: { row: AccountOverview }) {
  if (!row.owner) return <span className="text-ink-muted">No Owner</span>;
  return (
    <>
      {row.owner.name}
      <span className="block text-xs text-ink-muted">{row.owner.email}</span>
    </>
  );
}

/** Over a limit after a downgrade is information, not an error: no danger colour (decision #9). */
function Use({ row, limit }: { row: AccountOverview; limit: "branches" | "staffLogins" }) {
  const { text, over } = allowance(row.account.tier, limit, row.usage[limit]);
  return (
    <>
      {text}
      {over && <span className="block text-xs text-ink-muted">Over the limit</span>}
    </>
  );
}
