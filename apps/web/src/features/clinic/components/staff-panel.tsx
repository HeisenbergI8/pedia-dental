"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { AddStaffInput, StaffRole, canAddUnder, isActiveStaff, rolesOf, type AddStaffResult, type StaffMember } from "@pedia/shared";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL, useSession } from "@/features/auth/access";
import { formatDate } from "@/lib/format";
import { useAddStaff, useBranches, useClinicUsage, useStaff, useStaffActive } from "../api";
import { LimitNotice } from "./limit-notice";

const NO_SECOND_ROLE = "none"; // Radix Select can't hold ""

/** Staff logins (decisions #21, #23): add with a one-time temporary password, deactivate, reactivate. */
export function StaffPanel() {
  const staff = useStaff();
  const branches = useBranches();
  const usage = useClinicUsage();
  const myId = useSession()?.user.staffId;
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<StaffMember>();
  const reactivate = useStaffActive();

  if (staff.isLoading || branches.isLoading || usage.isLoading) return <Loading label="Loading staff" />;
  if (!staff.data || !branches.data || !usage.data) {
    return <ErrorState what="the staff list" onRetry={() => [staff, branches, usage].forEach((q) => void q.refetch())} />;
  }
  const { inUse, limit } = usage.data.staffLogins;
  const room = canAddUnder(usage.data.tier, "staffLogins", inUse);
  const branchName = new Map(branches.data.map((b) => [b.id, b.name]));
  // Active first, then by name: the people who can sign in are what the Owner is usually looking for.
  const rows = [...staff.data].sort((a, b) => Number(!isActiveStaff(a)) - Number(!isActiveStaff(b)) || a.fullName.localeCompare(b.fullName));

  return (
    <SectionCard
      title="Staff logins"
      description={`${inUse} of ${limit ?? "unlimited"} staff logins on your plan, yours included. Deactivated logins don't count.`}
      action={
        <Button onClick={() => setAdding(true)} disabled={!room} aria-describedby={room ? undefined : "staff-limit"}>
          <PlusIcon aria-hidden /> Add staff
        </Button>
      }
    >
      <div id="staff-limit">
        <LimitNotice usage={usage.data} limit="staffLogins" />
      </div>
      <DataList
        bare
        caption="Staff logins"
        rows={rows}
        rowKey={(s) => s.id}
        columns={[
          { key: "name", header: "Name", mobile: "title", cell: (s) => <>{s.fullName}{s.email && <span className="block text-xs font-normal text-ink-muted">{s.email}</span>}</> },
          {
            key: "status",
            header: "Status",
            mobile: "trailing",
            cell: (s) => (isActiveStaff(s) ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Deactivated {formatDate(s.deactivatedAt!)}</Badge>),
          },
          { key: "roles", header: "Role", mobile: "meta", cell: (s) => rolesOf(s).map((r) => ROLE_LABEL[r]).join(" + ") },
          { key: "branches", header: "Works at", mobile: "meta", cell: (s) => (s.isOwner ? "Every branch" : s.branchIds.map((id) => branchName.get(id) ?? "A removed branch").join(", ")) },
        ]}
        actions={(s) =>
          // The Owner's login and your own can't be deactivated (decision #13); the server refuses too.
          s.isOwner || s.id === myId ? null : isActiveStaff(s) ? (
            <Button size="sm" variant="ghost" onClick={() => setDeactivating(s)}>
              Deactivate
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={reactivate.isPending}
              onClick={() => reactivate.mutate({ id: s.id, active: true }, { onSuccess: () => toast.success(`${s.fullName} can sign in again`), onError: (e) => toast.error(e.message) })}
            >
              Reactivate
            </Button>
          )
        }
      />
      {adding && <AddStaffDialog onClose={() => setAdding(false)} />}
      {deactivating && <DeactivateDialog staff={deactivating} onClose={() => setDeactivating(undefined)} />}
    </SectionCard>
  );
}

function AddStaffDialog({ onClose }: { onClose: () => void }) {
  const add = useAddStaff();
  const open = (useBranches().data ?? []).filter((b) => !b.archived);
  const [result, setResult] = useState<AddStaffResult>();
  const form = useForm<AddStaffInput>({
    resolver: zodResolver(AddStaffInput),
    defaultValues: { fullName: "", email: "", role: "front_desk", alsoRoles: [], branchIds: open.length === 1 ? [open[0]!.id] : [], licenseNo: "" },
  });
  const [role, alsoRoles] = form.watch(["role", "alsoRoles"]);
  const dentist = role === "dentist" || alsoRoles?.includes("dentist");
  const submit = form.handleSubmit((input) => add.mutate({ ...input, licenseNo: dentist ? input.licenseNo || undefined : undefined }, { onSuccess: setResult }));

  return (
    // Once the password shows, closing by Escape or the overlay is off: it can't be shown again.
    <Dialog open onOpenChange={(o) => !o && !result && onClose()}>
      {/* No X once the password shows: "I've passed it on" is the way out, so it isn't lost to a stray click. */}
      <DialogContent showCloseButton={!result}>
        <DialogHeader>
          <DialogTitle>{result ? `${result.staff.fullName} is added` : "Add a staff login"}</DialogTitle>
          <DialogDescription>
            {result ? "Pass these on in person or by phone." : "They get a temporary password, shown once, and choose their own the first time they sign in."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <TemporaryPassword result={result} onDone={onClose} />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="space-y-4">
              <FormField name="fullName" label="Full name">
                <Input autoComplete="off" {...form.register("fullName")} />
              </FormField>
              <FormField name="email" label="Email" hint="They sign in with this.">
                <Input type="email" autoComplete="off" {...form.register("email")} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="role" label="Role">
                  {(props) => (
                    <Controller
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger {...props} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {StaffRole.options.map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </FormField>
                <FormField name="alsoRoles" label="Also works as" optional>
                  {(props) => (
                    <Controller
                      control={form.control}
                      name="alsoRoles"
                      render={({ field }) => (
                        <Select value={field.value?.[0] ?? NO_SECOND_ROLE} onValueChange={(v) => field.onChange(v === NO_SECOND_ROLE ? [] : [v])}>
                          <SelectTrigger {...props} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SECOND_ROLE}>No second role</SelectItem>
                            {StaffRole.options.filter((r) => r !== role).map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </FormField>
              </div>
              {dentist && (
                <FormField name="licenseNo" label="PRC licence number" optional>
                  <Input inputMode="numeric" {...form.register("licenseNo")} />
                </FormField>
              )}
              <FormField name="branchIds" label="Works at">
                {(props) => (
                  <Controller
                    control={form.control}
                    name="branchIds"
                    render={({ field }) => (
                      <div role="group" id={props.id} aria-labelledby={`${props.id}-label`} aria-describedby={props["aria-describedby"]} className="flex flex-wrap gap-x-4 gap-y-2">
                        {open.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              aria-label={b.name}
                              checked={field.value.includes(b.id)}
                              onCheckedChange={(on) => field.onChange(on ? [...field.value, b.id] : field.value.filter((id) => id !== b.id))}
                            />
                            {b.name}
                          </label>
                        ))}
                      </div>
                    )}
                  />
                )}
              </FormField>
              {add.error && <p role="alert" className="text-sm text-danger">{add.error.message}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={add.isPending}>
                  {add.isPending ? "Adding" : "Add staff"}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Decision #21: the only time the temporary password and PIN are ever shown. */
function TemporaryPassword({ result, onDone }: { result: AddStaffResult; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {result.staff.fullName} can sign in now with this temporary password, and chooses their own the first time.
        <strong> It is shown only once.</strong>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-selected p-4 text-sm">
        <dt className="text-ink-muted">Email</dt>
        <dd className="break-all">{result.staff.email}</dd>
        <dt className="text-ink-muted">Temporary password</dt>
        <dd className="font-mono text-base select-all">{result.temporaryPassword}</dd>
        <dt className="text-ink-muted">Switch-user PIN</dt>
        <dd className="font-mono select-all">{result.pin}</dd>
      </dl>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(result.temporaryPassword).then(
              () => toast.success("Password copied"),
              () => toast.error("Couldn't copy. Select the password and copy it instead."),
            )
          }
        >
          Copy password
        </Button>
        <Button onClick={onDone}>I&apos;ve passed it on</Button>
      </DialogFooter>
    </div>
  );
}

function DeactivateDialog({ staff, onClose }: { staff: StaffMember; onClose: () => void }) {
  const deactivate = useStaffActive();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deactivate {staff.fullName}?</DialogTitle>
          <DialogDescription>
            They can&apos;t sign in from now on, and are signed out on any device. Their name stays on the notes and payments they recorded, and the login frees a
            seat on your plan.
          </DialogDescription>
        </DialogHeader>
        {deactivate.error && <p role="alert" className="text-sm text-danger">{deactivate.error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="strong"
            disabled={deactivate.isPending}
            onClick={() => deactivate.mutate({ id: staff.id, active: false }, { onSuccess: () => (toast.success(`${staff.fullName} is deactivated`), onClose()) })}
          >
            Deactivate {staff.fullName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
