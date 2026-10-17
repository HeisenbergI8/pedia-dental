"use client";
import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PasswordResetInput } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRequestReset } from "@/features/portal/api";
import { AuthCard } from "./set-password-screen";

/**
 * A parent asks for a reset text (B11 decisions 6, 19). The answer is the same whether or not the number has an
 * account, so the page can't be used to learn who is a patient's parent.
 */
export function ForgotPasswordScreen() {
  const reset = useRequestReset();
  const form = useForm<PasswordResetInput>({ resolver: zodResolver(PasswordResetInput), defaultValues: { login: "" } });
  return (
    <AuthCard title="Forgot your password?">
      {reset.isSuccess ? (
        <p role="status" className="text-sm">
          If that number has a portal account, we&apos;ve texted a link. It works for 30 minutes.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">For parents. We&apos;ll text a link to the mobile number your clinic has. Staff: ask your clinic&apos;s Owner.</p>
          <FormProvider {...form}>
            <form noValidate onSubmit={form.handleSubmit((input) => reset.mutate(input))} className="space-y-4">
              <FormField name="login" label="Mobile number or email">
                <Input type="text" inputMode="email" autoComplete="username" {...form.register("login")} />
              </FormField>
              {reset.error && <p role="alert" className="text-sm text-danger">{reset.error.message}</p>}
              <Button type="submit" className="w-full" disabled={reset.isPending}>
                {reset.isPending ? "Sending" : "Text me a link"}
              </Button>
            </form>
          </FormProvider>
        </>
      )}
      <Link href="/login" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">Back to sign in</Link>
    </AuthCard>
  );
}
