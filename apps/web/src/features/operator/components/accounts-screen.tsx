"use client";
import { useState } from "react";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { TIER_LABEL, type AccountOverview } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList } from "@/components/data-list";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useAccounts } from "../api";
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
            { key: "owner", header: "Owner", mobile: "meta", cell: (r) => <Owner row={r} /> },
            { key: "branches", header: "Branches", mobile: "meta", numeric: true, cell: (r) => <Use row={r} limit="branches" /> },
            { key: "staff", header: "Staff logins", mobile: "meta", numeric: true, cell: (r) => <Use row={r} limit="staffLogins" /> },
            { key: "patients", header: "Patients", mobile: "meta", numeric: true, cell: (r) => r.usage.patients },
          ]}
        />
      )}
      {creating && <CreateAccountDialog onClose={() => setCreating(false)} />}
    </div>
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
