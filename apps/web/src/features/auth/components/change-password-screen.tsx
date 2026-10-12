"use client";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChangePasswordInput } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "../access";
import { useChangePassword, useSignOut } from "../api";

/**
 * First sign-in with a temporary password from the Owner (decision #21): the only screen until they choose their own.
 * The API refuses everything else meanwhile (mocks/access.ts), so this is the whole app for now.
 */
export function ChangePasswordScreen() {
  const user = useSession()?.user;
  const change = useChangePassword();
  const signOut = useSignOut();
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(ChangePasswordInput), defaultValues: { current: "", next: "" } });
  const submit = form.handleSubmit((input) => change.mutate(input, { onSuccess: () => toast.success("Password saved. Welcome!") }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Choose your password</h1>
          <p className="text-sm text-ink-muted">
            Hi {user?.name}. You signed in with a temporary password from your clinic. Choose one only you know.
          </p>
        </div>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField name="current" label="Temporary password">
              <Input type="password" autoComplete="current-password" {...form.register("current")} />
            </FormField>
            <FormField name="next" label="New password" hint="At least 8 characters">
              <Input type="password" autoComplete="new-password" {...form.register("next")} />
            </FormField>
            {change.error && <p role="alert" className="text-sm text-danger">{change.error.message}</p>}
            <Button type="submit" className="w-full" disabled={change.isPending}>
              {change.isPending ? "Saving" : "Save and continue"}
            </Button>
          </form>
        </FormProvider>
        <Button variant="link" className="h-auto px-0" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
