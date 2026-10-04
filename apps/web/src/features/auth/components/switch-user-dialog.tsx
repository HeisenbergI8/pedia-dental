"use client";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SwitchUserInput } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStaff } from "@/features/clinic/api";
import { env } from "@/lib/env";
import { ROLE_LABEL, useSession } from "../access";
import { useDemoAccounts, useSwitchUser } from "../api";

/**
 * Hands a shared device to a colleague: they pick themselves, then type their own PIN. Never a tap on a name alone,
 * and never a shared login. Staff only: the menu item sits behind <Can permission="session.switch">.
 */
export function SwitchUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const session = useSession();
  const staff = useStaff();
  const demo = useDemoAccounts();
  const switchUser = useSwitchUser();
  const form = useForm<SwitchUserInput>({ resolver: zodResolver(SwitchUserInput), defaultValues: { accountId: "", pin: "" } });
  const others = (staff.data ?? []).filter((s) => s.id !== session?.user.staffId);
  const chosen = others.find((s) => s.id === form.watch("accountId"));
  const demoPins = env.apiMocking ? (demo.data?.accounts ?? []).filter((a) => a.pin && a.id !== session?.user.id) : [];

  const close = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };

  function onSubmit(input: SwitchUserInput) {
    switchUser.mutate(input, {
      onSuccess: ({ user }) => {
        toast.success(`${user.name} (${ROLE_LABEL[user.role]}) is now using this device`);
        close(false);
      },
      // Wrong PIN (tries left) or locked: said under the PIN field, which is cleared for the next try.
      onError: (e) => {
        form.resetField("pin");
        form.setError("pin", { message: e.message });
        form.setFocus("pin");
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch user</DialogTitle>
          <DialogDescription>
            Hand this device to a colleague. They sign in with their own PIN, and anything not saved on this page is cleared.
          </DialogDescription>
        </DialogHeader>
        {staff.isLoading && <Loading label="Loading staff…" />}
        {staff.error && <ErrorState compact what="the staff list" onRetry={() => staff.refetch()} />}
        <FormProvider {...form}>
          <form id="switch-user" noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <Controller
              control={form.control}
              name="accountId"
              render={({ field, fieldState }) => (
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Who&apos;s taking over?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {others.map((s) => (
                      <label
                        key={s.id}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50"
                      >
                        <input
                          type="radio"
                          name={field.name}
                          value={s.id}
                          checked={field.value === s.id}
                          onChange={() => {
                            field.onChange(s.id);
                            form.resetField("pin");
                          }}
                          className="sr-only"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{s.fullName}</span>
                          <span className="block text-sm text-ink-muted">{ROLE_LABEL[s.role]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {fieldState.error && (
                    <p role="alert" className="text-sm text-danger">
                      {fieldState.error.message}
                    </p>
                  )}
                </fieldset>
              )}
            />
            {chosen && (
              <FormField name="pin" label={`${chosen.fullName}'s PIN`}>
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  autoFocus
                  className="max-w-40 tracking-[0.5em] tabular-nums"
                  {...form.register("pin")}
                />
              </FormField>
            )}
            {demoPins.length > 0 && (
              <details className="text-sm text-ink-muted">
                <summary className="min-h-11 cursor-pointer py-2">Demo PINs</summary>
                <ul className="mt-1 space-y-1">
                  {demoPins.map((a) => (
                    <li key={a.id}>
                      {a.name}: <span className="font-medium text-ink tabular-nums">{a.pin}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </form>
        </FormProvider>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" form="switch-user" disabled={switchUser.isPending}>
            {switchUser.isPending ? "Switching…" : "Switch user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
