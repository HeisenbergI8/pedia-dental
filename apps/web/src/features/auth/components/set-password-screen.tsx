"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { NewPassword } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { usePasswordLink, useSetPassword } from "@/features/portal/api";
import { PasswordField } from "./password-field";

const Form = z.object({ password: NewPassword });
type Form = z.infer<typeof Form>;

/** The card the signed-out password pages share (as ChangePasswordScreen). */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

const linkClass = "font-semibold text-brand underline-offset-2 hover:underline";

/**
 * The page a texted invite or reset link opens (B11 decisions 5, 6, 22). The token is in the address's fragment, which
 * no server log sees; it is read once, then dropped from the address bar and history.
 */
export function SetPasswordScreen() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "");
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  const link = usePasswordLink(token || undefined);
  const save = useSetPassword();
  const form = useForm<Form>({ resolver: zodResolver(Form), defaultValues: { password: "" } });

  if (token === null || link.isLoading) {
    return (
      <AuthCard title="Set your password">
        <Loading label="Checking your link" />
      </AuthCard>
    );
  }
  if (!link.data) {
    return (
      <AuthCard title="This link has expired or was already used">
        <p className="text-sm text-ink-muted">
          {token ? "Links work once, for a limited time." : "This link isn't complete. Open it again from the text."} Forgot your password?{" "}
          <Link href="/forgot-password" className={linkClass}>Get a new reset link</Link>. Never signed in? Ask your clinic for a new invite.
        </p>
        <Link href="/login" className={linkClass}>Go to sign in</Link>
      </AuthCard>
    );
  }
  const { purpose, name, clinicName, login } = link.data;
  return (
    <AuthCard title={purpose === "invite" ? `Welcome, ${name.split(/\s+/)[0]}` : "Choose a new password"}>
      <p className="text-sm text-ink-muted">
        {purpose === "invite" ? `Choose your password for ${clinicName}'s parent portal.` : `For ${name} at ${clinicName}.`} You&apos;ll sign in
        with your mobile number ({login}) and this password.
      </p>
      <FormProvider {...form}>
        <form noValidate onSubmit={form.handleSubmit(({ password }) => save.mutate({ token, password }))} className="space-y-4">
          <PasswordField name="password" label="New password" hint="At least 8 characters" autoComplete="new-password" register={form.register("password")} />
          {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "Saving" : "Save and sign in"}
          </Button>
        </form>
      </FormProvider>
    </AuthCard>
  );
}
