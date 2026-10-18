"use client";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OperatorLoginInput } from "@pedia/shared";
import { PrimolarLogo } from "@/components/brand";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoAccounts } from "@/features/auth/api";
import { demoHelp } from "@/features/auth/demo";
import { env } from "@/lib/env";
import { useOperatorSignIn } from "../api";

/** Primolar's own sign-in (decisions #3, #32). Not the clinic sign-in: clinic logins don't work here, nor the reverse. */
export function OperatorLogin() {
  const router = useRouter();
  const signIn = useOperatorSignIn();
  const demo = useDemoAccounts();
  const form = useForm<OperatorLoginInput>({ resolver: zodResolver(OperatorLoginInput), defaultValues: { email: "", password: "" } });
  const submit = form.handleSubmit((input) => signIn.mutate(input, { onSuccess: () => router.replace("/operator") }));

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <PrimolarLogo className="mx-auto w-52" />
        <div className="space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <header className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Primolar console</h1>
            <p className="text-sm text-ink-muted">For Primolar staff. Clinics sign in on the clinic sign-in page.</p>
          </header>
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="space-y-4">
              <FormField name="email" label="Email">
                <Input type="email" autoComplete="username" {...form.register("email")} />
              </FormField>
              <FormField name="password" label="Password">
                <Input type="password" autoComplete="current-password" {...form.register("password")} />
              </FormField>
              {signIn.error && <p role="alert" className="text-sm text-danger">{signIn.error.message}</p>}
              <Button type="submit" className="w-full" disabled={signIn.isPending}>
                {signIn.isPending ? "Signing in" : "Sign in"}
              </Button>
            </form>
          </FormProvider>
        </div>
        {demoHelp(env.apiMockingMode, demo) === "show" && (
          <p className="text-center text-sm text-ink-muted">
            Demo sign-in: <span className="font-mono">operator@primolar.demo</span> · <span className="font-mono">pass123</span>
          </p>
        )}
      </div>
    </main>
  );
}
