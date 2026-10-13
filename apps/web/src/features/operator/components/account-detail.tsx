"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2Icon, ChevronLeftIcon } from "lucide-react";
import { toast } from "sonner";
import { DESIGN_STATUS_LABEL, TIER_LABEL, Tier, isTierUpgrade, type AccountOverview } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL } from "@/features/auth/access";
import { formatDate } from "@/lib/format";
import { useAccounts, useChangeTier, useOwnerCandidates, useSetSuspended, useTransferOwnership } from "../api";
import { allowance, overLimits } from "./allowance";
import { SetBrandingDialog } from "./set-branding-dialog";
import { StatusBadge } from "./status-badge";
import { SubscriptionCard } from "./subscription-card";

/**
 * One clinic account: its plan, whether it is paused, and who owns it (decisions #4, #13, #26). Read from the account
 * list (no per-account route): everything here is counts and staff names, never a patient record (#25).
 */
export function AccountDetail({ id }: { id: string }) {
  const accounts = useAccounts();
  if (accounts.isLoading) return <Loading label="Loading the clinic account" />;
  if (accounts.error) return <ErrorState what="the clinic account" onRetry={() => void accounts.refetch()} />;
  const row = accounts.data?.find((r) => r.account.id === id);

  return (
    <div className="space-y-5">
      <Link href="/operator" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeftIcon className="size-4" aria-hidden /> Clinic accounts
      </Link>
      {!row ? (
        <EmptyState icon={Building2Icon} title="No such clinic account">It may have been removed with Reset demo data.</EmptyState>
      ) : (
        <>
          <PageHeader title={row.account.name} description={row.account.contactEmail} actions={<StatusBadge status={row.account.status} />} />
          <div className="grid gap-5 lg:grid-cols-2">
            <PlanCard row={row} />
            <StatusCard row={row} />
          </div>
          <SubscriptionCard row={row} />
          <AgreementCard row={row} />
          <OwnerCard row={row} />
          {row.design && <DesignCard row={row} />}
        </>
      )}
    </div>
  );
}

/** Billing #27, platform #9: an upgrade now, a downgrade on the next due date, and nothing is disabled. Reversible, so no confirm. */
function PlanCard({ row }: { row: AccountOverview }) {
  const [tier, setTier] = useState<Tier>(row.account.tier);
  const change = useChangeTier(row.account.id);
  const over = overLimits(tier, row.usage);

  return (
    <SectionCard title="Plan" description="An upgrade applies at once, billed at the new price from the next due date. A downgrade waits for the next due date.">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-ink-muted">Open branches</dt>
        <dd className="tabular-nums">{allowance(row.account.tier, "branches", row.usage.branches).text}</dd>
        <dt className="text-ink-muted">Staff logins</dt>
        <dd className="tabular-nums">{allowance(row.account.tier, "staffLogins", row.usage.staffLogins).text}</dd>
        <dt className="text-ink-muted">Patients</dt>
        <dd className="tabular-nums">{row.usage.patients}</dd>
      </dl>
      <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="tier">Plan</Label>
          <Select value={tier} onValueChange={(v) => setTier(Tier.parse(v))}>
            <SelectTrigger id="tier" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Tier.options.map((t) => (
                <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={tier === row.account.tier || change.isPending}
          onClick={() =>
            change.mutate(tier, {
              onSuccess: () =>
                toast.success(
                  isTierUpgrade(row.account.tier, tier)
                    ? `${row.account.name} is on the ${TIER_LABEL[tier]} plan`
                    : `${row.account.name} moves to the ${TIER_LABEL[tier]} plan on its next due date`,
                ),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          Save plan
        </Button>
      </div>
      {over.length > 0 && (
        <p role="status" className="text-sm text-ink-muted">
          On {TIER_LABEL[tier]}, this clinic is over the limit for {over.join(" and ")}. Everything keeps working; nothing new can be added until it is back
          under.
        </p>
      )}
    </SectionCard>
  );
}

/** Decisions #26, #41, #44: what pausing does, said before it happens. Reactivating restores everything, so no confirm. */
function StatusCard({ row }: { row: AccountOverview }) {
  const [confirming, setConfirming] = useState(false);
  const set = useSetSuspended(row.account.id);
  const paused = row.account.status === "suspended";

  return (
    <SectionCard title="Account status" description={paused ? "Paused: staff can't sign in; parents can still read their child's records." : "Active."}>
      {paused ? (
        <Button
          variant="outline"
          disabled={set.isPending}
          onClick={() => set.mutate(false, { onSuccess: () => toast.success(`${row.account.name} is active again`), onError: (e) => toast.error(e.message) })}
        >
          Reactivate account
        </Button>
      ) : (
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          Pause account
        </Button>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pause {row.account.name}?</DialogTitle>
            <DialogDescription>
              Its staff are signed out on their next action and can&apos;t sign in. Parents keep read-only access to their children&apos;s records. Nothing is
              deleted: reactivating brings everything back.
            </DialogDescription>
          </DialogHeader>
          {set.error && <p role="alert" className="text-sm text-danger">{set.error.message}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={set.isPending}
              onClick={() => set.mutate(true, { onSuccess: () => (toast.success(`${row.account.name} is paused`), setConfirming(false)) })}
            >
              Pause {row.account.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

/** Billing #17: Design it for me. The clinic runs in the default look until Primolar delivers the finished one. */
function DesignCard({ row }: { row: AccountOverview }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard title="Design it for me" description={DESIGN_STATUS_LABEL[row.design!]}>
      <p className="text-sm text-ink-muted">
        {row.design === "delivered"
          ? "The finished logo, colour and font are live. The Owner can change them in Settings."
          : "Revisions and approval happen by email or chat. When the client approves, deliver the finished files here."}
      </p>
      <Button variant={row.design === "delivered" ? "outline" : "default"} onClick={() => setOpen(true)}>
        Set branding
      </Button>
      {open && <SetBrandingDialog row={row} onClose={() => setOpen(false)} />}
    </SectionCard>
  );
}

/** Privacy #8, #10: the agreement in force and how many patients have no consent recorded. Counts only (platform #25). */
function AgreementCard({ row }: { row: AccountOverview }) {
  const { agreement, current, patientsWithoutConsent } = row.privacy;
  const how = !agreement
    ? "None on record"
    : agreement.method === "on_file"
      ? `Signed agreement on file, signed ${formatDate(agreement.signedOn ?? agreement.at.slice(0, 10))}`
      : `Accepted online on ${formatDate(agreement.at.slice(0, 10))}`;
  return (
    <SectionCard
      title="Agreement and consent"
      description={current ? "Terms of Service and Data Processing Agreement up to date." : "A newer version is waiting: the Owner accepts it at their next sign-in."}
    >
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Agreement</dt>
          <dd className="font-medium">{how}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Versions and who</dt>
          <dd className="font-medium">{agreement ? `Terms v${agreement.termsVersion}, DPA v${agreement.dpaVersion}, by ${agreement.acceptedBy}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Patients without consent recorded</dt>
          <dd className="font-medium tabular-nums">{patientsWithoutConsent}</dd>
        </div>
      </dl>
    </SectionCard>
  );
}

/** Decision #13: only Primolar moves ownership, only to an active staff login of this clinic. */
function OwnerCard({ row }: { row: AccountOverview }) {
  const [open, setOpen] = useState(false);
  return (
    <SectionCard
      title="Owner"
      description="The clinic's master login: Settings, branding, branches, staff and every branch."
      action={
        <Button variant="outline" onClick={() => setOpen(true)}>
          Transfer ownership
        </Button>
      }
    >
      {row.owner ? (
        <p className="text-sm">
          <span className="font-semibold">{row.owner.name}</span> · {row.owner.email}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">No Owner on record.</p>
      )}
      {open && <TransferDialog row={row} onClose={() => setOpen(false)} />}
    </SectionCard>
  );
}

function TransferDialog({ row, onClose }: { row: AccountOverview; onClose: () => void }) {
  const candidates = useOwnerCandidates(row.account.id, true);
  const transfer = useTransferOwnership(row.account.id);
  const [staffId, setStaffId] = useState<string>();
  const to = candidates.data?.find((c) => c.staffId === staffId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership of {row.account.name}</DialogTitle>
          <DialogDescription>To one of the clinic&apos;s active staff logins. There is always exactly one Owner.</DialogDescription>
        </DialogHeader>
        {candidates.isLoading && <Loading compact label="Loading staff logins" />}
        {candidates.error && <ErrorState what="the staff logins" onRetry={() => void candidates.refetch()} />}
        {candidates.data?.length === 0 && <p className="text-sm text-ink-muted">Add another staff login first. The Owner adds staff in Settings.</p>}
        {!!candidates.data?.length && (
          <div className="space-y-1.5">
            <Label htmlFor="new-owner">New Owner</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger id="new-owner" className="w-full">
                <SelectValue placeholder="Choose a staff login" />
              </SelectTrigger>
              <SelectContent>
                {candidates.data.map((c) => (
                  <SelectItem key={c.staffId} value={c.staffId}>
                    {c.name} · {c.roles.map((r) => ROLE_LABEL[r]).join(" + ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {to && row.owner && (
          <p className="text-sm">
            {to.name} becomes the Owner. {row.owner.name} keeps their job and branches but loses Settings and every-branch access.
          </p>
        )}
        {transfer.error && <p role="alert" className="text-sm text-danger">{transfer.error.message}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!to || transfer.isPending}
            onClick={() => to && transfer.mutate(to.staffId, { onSuccess: () => (toast.success(`${to.name} now owns ${row.account.name}`), onClose()) })}
          >
            Transfer ownership
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
