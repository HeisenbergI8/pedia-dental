"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { BranchInput, DEFAULT_OPENING_HOURS, canAddUnder, type Branch, type OpeningHours } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList } from "@/components/data-list";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useBranchArchive, useBranches, useClinicUsage, useSaveBranch } from "../api";
import { LimitNotice } from "./limit-notice";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Minutes from midnight ⇄ the "08:00" a time input holds. */
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const fromTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const clock = (min: number) => new Date(2000, 0, 1, 0, min).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
const hoursLine = (h: OpeningHours) =>
  `${clock(h.opensAt)}–${clock(h.closesAt)}${h.closedWeekdays.length ? `, closed ${h.closedWeekdays.map((d) => WEEKDAYS[d]).join(", ")}` : ""}`;

type Editing = { branch?: Branch } | undefined;

/** Add, edit, archive and reopen branches (decision #22), with the tier's branch limit shown before Add is pressed. */
export function BranchesPanel() {
  const branches = useBranches();
  const usage = useClinicUsage();
  const [editing, setEditing] = useState<Editing>();
  const [archiving, setArchiving] = useState<Branch>();
  const reopen = useBranchArchive();

  if (branches.isLoading || usage.isLoading) return <Loading label="Loading branches" />;
  if (!branches.data || !usage.data) return <ErrorState what="the branches" onRetry={() => [branches, usage].forEach((q) => void q.refetch())} />;
  const { inUse, limit } = usage.data.branches;
  const room = canAddUnder(usage.data.tier, "branches", inUse);

  return (
    <SectionCard
      title="Branches"
      description={`${inUse} of ${limit ?? "unlimited"} open branch${limit === 1 ? "" : "es"} on your plan. Archived branches don't count.`}
      action={
        <Button onClick={() => setEditing({})} disabled={!room} aria-describedby={room ? undefined : "branch-limit"}>
          <PlusIcon aria-hidden /> Add branch
        </Button>
      }
    >
      <div id="branch-limit">
        <LimitNotice usage={usage.data} limit="branches" />
      </div>
      <DataList
        bare
        caption="Branches"
        rows={branches.data}
        rowKey={(b) => b.id}
        columns={[
          { key: "name", header: "Branch", mobile: "title", cell: (b) => b.name },
          { key: "status", header: "Status", mobile: "trailing", cell: (b) => (b.archived ? <Badge variant="outline">Archived</Badge> : <Badge variant="secondary">Open</Badge>) },
          { key: "address", header: "Address and phone", mobile: "meta", cell: (b) => <>{b.address}<span className="block text-ink-muted">{b.phone}</span></> },
          { key: "hours", header: "Hours", mobile: "meta", cell: (b) => hoursLine(b.openingHours) },
        ]}
        actions={(b) => (
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing({ branch: b })}>
              Edit
            </Button>
            {b.archived ? (
              <Button
                size="sm"
                variant="outline"
                disabled={reopen.isPending}
                onClick={() => reopen.mutate({ id: b.id, archive: false }, { onSuccess: () => toast.success(`${b.name} is open again`), onError: (e) => toast.error(e.message) })}
              >
                Reopen
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setArchiving(b)}>
                Archive
              </Button>
            )}
          </div>
        )}
      />
      {editing && <BranchDialog branch={editing.branch} onClose={() => setEditing(undefined)} />}
      {archiving && <ArchiveDialog branch={archiving} onClose={() => setArchiving(undefined)} />}
    </SectionCard>
  );
}

function BranchDialog({ branch, onClose }: { branch?: Branch; onClose: () => void }) {
  const save = useSaveBranch();
  const form = useForm<BranchInput>({
    resolver: zodResolver(BranchInput),
    defaultValues: branch ? { name: branch.name, address: branch.address, phone: branch.phone, openingHours: branch.openingHours } : { name: "", address: "", phone: "", openingHours: DEFAULT_OPENING_HOURS },
  });
  const submit = form.handleSubmit((input) =>
    save.mutate(
      { ...input, id: branch?.id },
      {
        onSuccess: (saved) => {
          toast.success(branch ? `${saved.name} saved` : `${saved.name} added`);
          onClose();
        },
      },
    ),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? `Edit ${branch.name}` : "Add a branch"}</DialogTitle>
          <DialogDescription>Its address and phone print under your clinic&apos;s name on receipts and documents.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField name="name" label="Branch name">
              <Input {...form.register("name")} />
            </FormField>
            <FormField name="address" label="Address">
              <Input autoComplete="street-address" {...form.register("address")} />
            </FormField>
            <FormField name="phone" label="Phone">
              <Input type="tel" {...form.register("phone")} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              {(["opensAt", "closesAt"] as const).map((key) => (
                <FormField key={key} name={`openingHours.${key}`} label={key === "opensAt" ? "Opens" : "Closes"}>
                  {(props) => (
                    <Controller
                      control={form.control}
                      name={`openingHours.${key}`}
                      render={({ field }) => <Input {...props} type="time" step={900} value={toTime(field.value)} onChange={(e) => e.target.value && field.onChange(fromTime(e.target.value))} />}
                    />
                  )}
                </FormField>
              ))}
            </div>
            <Controller
              control={form.control}
              name="openingHours.closedWeekdays"
              render={({ field }) => (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Closed on</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {WEEKDAYS.map((label, day) => (
                      <label key={label} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          aria-label={label}
                          checked={field.value.includes(day)}
                          onCheckedChange={(on) => field.onChange(on ? [...field.value, day].sort() : field.value.filter((d) => d !== day))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            />
            {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving" : branch ? "Save branch" : "Add branch"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Archive, never delete (decision #22). The server says why not when it can't (archiveProblem). */
function ArchiveDialog({ branch, onClose }: { branch: Branch; onClose: () => void }) {
  const archive = useBranchArchive();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {branch.name}?</DialogTitle>
          <DialogDescription>It leaves the branch switcher and booking. Its appointments, invoices and payments stay in your records, and you can reopen it later.</DialogDescription>
        </DialogHeader>
        {archive.error && <p role="alert" className="text-sm text-danger">{archive.error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="strong"
            disabled={archive.isPending}
            onClick={() => archive.mutate({ id: branch.id, archive: true }, { onSuccess: () => (toast.success(`${branch.name} archived`), onClose()) })}
          >
            Archive {branch.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
