"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CreateAccountInput, TIER_LABEL, Tier, formatTin, type CreateAccountResult } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api-client";
import { useCreateAccount } from "../api";

const EMPTY: CreateAccountInput = {
  account: { name: "", contactEmail: "", tin: "", tier: "small" },
  branch: { name: "", address: "", phone: "" },
  owner: { fullName: "", email: "", role: "dentist" },
};

/**
 * Decision #3: a clinic account, its first branch and its Owner. The Owner's temporary password and PIN show once,
 * then the dialog can only be left by "I've passed it on" (the Add staff pattern, decision #21).
 */
export function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount();
  const [result, setResult] = useState<CreateAccountResult>();
  const form = useForm<CreateAccountInput>({ resolver: zodResolver(CreateAccountInput), defaultValues: EMPTY });
  const submit = form.handleSubmit((input) =>
    create.mutate(input, {
      onSuccess: setResult,
      // A duplicate name is the one refusal tied to a field (decision #63).
      onError: (e) => e instanceof ApiError && e.status === 409 && form.setError("account.name", { message: e.message }),
    }),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !result && onClose()}>
      {/* No X once the password shows: "I've passed it on" is the way out, so it isn't lost to a stray click. */}
      <DialogContent showCloseButton={!result} className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{result ? `${result.overview.account.name} is on Primolar` : "New clinic account"}</DialogTitle>
          <DialogDescription>
            {result
              ? "Pass the Owner's sign-in on in person or by phone."
              : "The Owner signs in with a temporary password, shown once, and sets up the clinic's look, branches and staff in Settings."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <OwnerPassword result={result} onDone={onClose} />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="space-y-6">
              <fieldset className="space-y-4">
                <legend className="mb-3 text-sm font-semibold">Clinic</legend>
                <FormField name="account.name" label="Clinic name">
                  <Input autoComplete="off" {...form.register("account.name")} />
                </FormField>
                <FormField name="account.contactEmail" label="Contact email">
                  <Input type="email" autoComplete="off" {...form.register("account.contactEmail")} />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField name="account.tin" label="TIN" hint="9 digits, then the branch code if any">
                    <Input
                      inputMode="numeric"
                      value={form.watch("account.tin")}
                      onChange={(e) => form.setValue("account.tin", formatTin(e.target.value), { shouldValidate: form.formState.isSubmitted })}
                    />
                  </FormField>
                  <FormField name="account.tier" label="Plan" hint="Sets the branch and login limits">
                    {(props) => (
                      <Controller
                        control={form.control}
                        name="account.tier"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger {...props} className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Tier.options.map((t) => (
                                <SelectItem key={t} value={t}>{TIER_LABEL[t]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )}
                  </FormField>
                </div>
              </fieldset>

              <fieldset className="space-y-4 border-t border-line pt-5">
                <legend className="mb-3 text-sm font-semibold">First branch</legend>
                <FormField name="branch.name" label="Branch name">
                  <Input autoComplete="off" {...form.register("branch.name")} />
                </FormField>
                <FormField name="branch.address" label="Address">
                  <Input autoComplete="off" {...form.register("branch.address")} />
                </FormField>
                <FormField name="branch.phone" label="Phone">
                  <Input type="tel" autoComplete="off" {...form.register("branch.phone")} />
                </FormField>
              </fieldset>

              <fieldset className="space-y-4 border-t border-line pt-5">
                <legend className="mb-3 text-sm font-semibold">Owner</legend>
                <FormField name="owner.fullName" label="Full name">
                  <Input autoComplete="off" {...form.register("owner.fullName")} />
                </FormField>
                <FormField name="owner.email" label="Email" hint="They sign in with this.">
                  <Input type="email" autoComplete="off" {...form.register("owner.email")} />
                </FormField>
                <Controller
                  control={form.control}
                  name="owner.role"
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      {/* Decision #58: the Owner's job role is Dentist or Admin, never Front desk. */}
                      <Checkbox id="owner-dentist" checked={field.value === "dentist"} onCheckedChange={(on) => field.onChange(on ? "dentist" : "admin")} />
                      <Label htmlFor="owner-dentist" className="font-normal">
                        The Owner also treats patients (a dentist)
                      </Label>
                    </div>
                  )}
                />
              </fieldset>

              {create.error && !form.formState.errors.account?.name && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating" : "Create clinic account"}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}

function OwnerPassword({ result, onDone }: { result: CreateAccountResult; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {result.overview.owner?.name} can sign in now with this temporary password, and chooses their own the first time.
        <strong> It is shown only once.</strong>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-selected p-4 text-sm">
        <dt className="text-ink-muted">Email</dt>
        <dd className="break-all">{result.overview.owner?.email}</dd>
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
