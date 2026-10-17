"use client";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChangePasswordInput } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/features/auth/components/password-field";
import { useChangePassword } from "@/features/auth/api";

/** A parent changes their own password (B11 decision 7). A seeded demo parent keeps the demo one: the 403 says so. */
export function PortalPassword() {
  const change = useChangePassword();
  const form = useForm<ChangePasswordInput>({ resolver: zodResolver(ChangePasswordInput), defaultValues: { current: "", next: "" } });
  const submit = form.handleSubmit((input) =>
    change.mutateAsync(input).then(
      () => {
        form.reset();
        toast.success("Password changed");
      },
      () => undefined,
    ),
  );
  return (
    <section aria-labelledby="password-heading" className="max-w-md space-y-4">
      <h1 id="password-heading" className="text-2xl font-semibold tracking-tight">Change password</h1>
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <PasswordField name="current" label="Current password" autoComplete="current-password" register={form.register("current")} />
          <PasswordField name="next" label="New password" hint="At least 8 characters" autoComplete="new-password" register={form.register("next")} />
          {change.error && <p role="alert" className="text-sm text-danger">{change.error.message}</p>}
          <Button type="submit" className="w-full sm:w-auto" disabled={change.isPending}>
            {change.isPending ? "Saving" : "Change password"}
          </Button>
        </form>
      </FormProvider>
    </section>
  );
}
