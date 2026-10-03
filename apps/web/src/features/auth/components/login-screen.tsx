"use client";
import Link from "next/link";
import { useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheckIcon, HeartHandshakeIcon, ShieldCheckIcon, SmileIcon, StethoscopeIcon, type LucideIcon } from "lucide-react";
import { LoginInput, type DemoAccount, type Role } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_HOME, ROLE_LABEL, useSession } from "../access";
import { authKeys, useDemoAccounts, useSignIn } from "../api";

const ROLE_ICON: Record<Role, LucideIcon> = {
  admin: ShieldCheckIcon,
  dentist: StethoscopeIcon,
  front_desk: CalendarCheckIcon,
  parent: HeartHandshakeIcon,
};

export function LoginScreen() {
  const demo = useDemoAccounts();
  const signIn = useSignIn();
  const session = useSession();
  const accounts = demo.data?.accounts ?? [];
  // The account this page opened with. Once a sign-in starts, or the session changes to someone else,
  // the "signed in as" line would only flash the old or new name while the next page loads.
  const [openedAs] = useState(() => session?.user.id);
  const signingIn = useIsMutating({ mutationKey: authKeys.signIn }) > 0 || session?.user.id !== openedAs;
  const busyEmail = signIn.isPending ? signIn.variables?.email : undefined;
  const pick = (a: DemoAccount) => signIn.mutate({ email: a.email, password: demo.data?.password ?? "" });

  return (
    <main className="min-h-screen bg-ground px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="flex items-center gap-2.5 font-semibold">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-ink">
              <SmileIcon className="size-5" aria-hidden />
            </span>
            Pedia Dental
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-ink-muted">This is a demo with sample data. Choose an account to see the app as that person.</p>
        </header>

        {session && !signingIn && (
          <p role="status" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
            You&apos;re signed in as <strong>{session.user.name}</strong> ({ROLE_LABEL[session.user.role]}).{" "}
            <Link href={ROLE_HOME[session.user.role]} className="font-medium text-brand underline-offset-2 hover:underline">
              Continue
            </Link>{" "}
            or choose another account.
          </p>
        )}
        {signIn.error && <p role="alert" className="text-sm text-danger">{signIn.error.message}</p>}
        {demo.isLoading && <p className="text-ink-muted">Loading demo accounts…</p>}
        {demo.error && <p role="alert" className="text-danger">Couldn&apos;t load the demo accounts. Sign in with an email below.</p>}

        <AccountGroup title="Clinic staff" accounts={accounts.filter((a) => a.role !== "parent")} busyEmail={busyEmail} onPick={pick} />
        <AccountGroup
          title="Parents"
          description="The parent portal, for one family."
          accounts={accounts.filter((a) => a.role === "parent")}
          busyEmail={busyEmail}
          onPick={pick}
        />
        <EmailSignIn password={demo.data?.password ?? ""} />
      </div>
    </main>
  );
}

function AccountGroup(props: {
  title: string;
  description?: string;
  accounts: DemoAccount[];
  busyEmail?: string;
  onPick: (a: DemoAccount) => void;
}) {
  if (props.accounts.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{props.title}</h2>
        {props.description && <p className="text-sm text-ink-muted">{props.description}</p>}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {props.accounts.map((a) => {
          const Icon = ROLE_ICON[a.role];
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => props.onPick(a)}
                disabled={!!props.busyEmail}
                aria-busy={props.busyEmail === a.email}
                className="flex min-h-16 w-full items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.name}</span>
                  <span className="block text-sm text-ink-muted">
                    {ROLE_LABEL[a.role]} · {a.summary}
                  </span>
                </span>
                {props.busyEmail === a.email && <span className="text-sm text-ink-muted">Signing in…</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EmailSignIn({ password }: { password: string }) {
  const signIn = useSignIn();
  const form = useForm<LoginInput>({ resolver: zodResolver(LoginInput), values: { email: "", password } });
  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer font-medium">Sign in with email and password</summary>
      <FormProvider {...form}>
        <form noValidate onSubmit={form.handleSubmit((input) => signIn.mutate(input))} className="mt-4 max-w-sm space-y-4">
          <FormField name="email" label="Email">
            <Input type="email" autoComplete="username" {...form.register("email")} />
          </FormField>
          <FormField name="password" label="Password">
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </FormField>
          {password && (
            <p className="text-sm text-ink-muted">
              Every demo account uses the password <code>{password}</code>. It&apos;s filled in for you.
            </p>
          )}
          {signIn.error && <p role="alert" className="text-sm text-danger">{signIn.error.message}</p>}
          <Button type="submit" disabled={signIn.isPending}>{signIn.isPending ? "Signing in…" : "Sign in"}</Button>
        </form>
      </FormProvider>
    </details>
  );
}
