"use client";
import Link from "next/link";
import { useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheckIcon, HeartHandshakeIcon, HeartIcon, RainbowIcon, ShieldCheckIcon, SparklesIcon, StethoscopeIcon, type LucideIcon } from "lucide-react";
import { LoginInput, type DemoAccounts, type Role } from "@pedia/shared";
import { KidsmileLogo, Loading, LoadingScreen } from "@/components/brand";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { ROLE_HOME, ROLE_LABEL, useSession } from "../access";
import { authKeys, useDemoAccounts, useSignIn } from "../api";

const ROLE_ICON: Record<Role, LucideIcon> = {
  admin: ShieldCheckIcon,
  dentist: StethoscopeIcon,
  front_desk: CalendarCheckIcon,
  parent: HeartHandshakeIcon,
};

/** A crayon tint per role, for recognition only: the role is always written out beside it. */
const ROLE_TINT: Record<Role, string> = {
  admin: "bg-crayon-purple/15",
  dentist: "bg-crayon-teal/30",
  front_desk: "bg-crayon-lime/30",
  parent: "bg-crayon-orange/20",
};

/** The clinic's own promises, as they put them on their page. */
const PROMISES: { icon: LucideIcon; text: string; tint: string }[] = [
  { icon: RainbowIcon, text: "Child-friendly dental care", tint: "bg-crayon-orange/20" },
  { icon: HeartIcon, text: "Gentle and caring pediatric dentists", tint: "bg-crayon-teal/30" },
  { icon: SparklesIcon, text: "A fun clinic environment", tint: "bg-crayon-yellow/40" },
];

export function LoginScreen() {
  const demo = useDemoAccounts();
  const session = useSession();
  // The account this page opened with. Once a sign-in starts, or the session changes to someone else,
  // the "signed in as" line would only flash the old or new name while the next page loads.
  const [openedAs] = useState(() => session?.user.id);
  const signingIn = useIsMutating({ mutationKey: authKeys.signIn }) > 0 || session?.user.id !== openedAs;

  return (
    <>
      <main inert={signingIn} className="relative min-h-screen overflow-hidden bg-ground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Brand panel: the clinic introduces itself the way it does on its own page. */}
        <section aria-label="About Kidsmile" className="relative overflow-hidden bg-surface px-6 pt-8 pb-10 lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-16">
          <span aria-hidden className="brand-strip absolute inset-x-0 top-0 h-1.5" />
          <span aria-hidden className="absolute -top-16 -right-20 size-56 rounded-full bg-crayon-teal/20" />
          <span aria-hidden className="absolute -bottom-24 -left-16 hidden size-64 rounded-full bg-crayon-yellow/25 lg:block" />
          <div className="relative mx-auto max-w-md space-y-6 lg:mx-0">
            <KidsmileLogo priority className="w-60 sm:w-72 lg:w-80" />
            <p className="font-display text-2xl leading-snug font-medium text-balance lg:text-3xl">
              Give your child a <span className="text-brand">smile</span> they&apos;ll love.
            </p>
            <ul className="hidden space-y-3 sm:block">
              {PROMISES.map(({ icon: Icon, text, tint }) => (
                <li key={text} className="flex items-center gap-3 text-sm font-medium">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-ink", tint)}>
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="px-4 py-10 sm:px-8 lg:flex lg:items-center lg:py-16">
          <div className="mx-auto w-full max-w-2xl space-y-8">
            <header className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
              <p className="text-ink-muted">Sign in with your clinic or parent account.</p>
            </header>

            {session && !signingIn && (
              <p role="status" className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                You&apos;re signed in as <strong>{session.user.name}</strong> ({ROLE_LABEL[session.user.role]}).{" "}
                <Link href={ROLE_HOME[session.user.role]} className="font-medium text-brand underline-offset-2 hover:underline">
                  Continue
                </Link>{" "}
                or sign in as someone else.
              </p>
            )}
            <EmailSignIn />
            {env.apiMocking && (
              <>
                {demo.isLoading && <Loading label="Loading demo logins…" />}
                {demo.error && <p role="alert" className="text-danger">Couldn&apos;t load the demo logins.</p>}
                {demo.data && <DemoLogins {...demo.data} />}
              </>
            )}
          </div>
        </div>
      </main>
      {/* Over the page rather than instead of it, so the email form keeps its state if sign-in fails. */}
      {signingIn && (
        <div className="fixed inset-0 z-50">
          <LoadingScreen label="Signing you in…" />
        </div>
      )}
    </>
  );
}

function EmailSignIn() {
  const signIn = useSignIn();
  const form = useForm<LoginInput>({ resolver: zodResolver(LoginInput), defaultValues: { email: "", password: "" } });
  return (
    <section aria-label="Sign in" className="rounded-xl border border-line bg-surface p-4 shadow-card sm:p-6">
      <FormProvider {...form}>
        <form noValidate onSubmit={form.handleSubmit((input) => signIn.mutate(input))} className="space-y-4">
          <FormField name="email" label="Email">
            <Input type="email" autoComplete="username" {...form.register("email")} />
          </FormField>
          <FormField name="password" label="Password">
            <Input type="password" autoComplete="current-password" {...form.register("password")} />
          </FormField>
          {signIn.error && <p role="alert" className="text-sm text-danger">{signIn.error.message}</p>}
          <Button type="submit" disabled={signIn.isPending} className="w-full sm:w-auto">
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </FormProvider>
    </section>
  );
}

/** Prototype only: one login per role, typed into the form like a real account. */
function DemoLogins({ logins, password }: Pick<DemoAccounts, "logins" | "password">) {
  return (
    <section aria-labelledby="demo-logins" className="space-y-3">
      <div>
        <h2 id="demo-logins" className="text-lg font-semibold">Demo logins</h2>
        <p className="text-sm text-ink-muted">
          This is a demo with sample data. Every login uses the password{" "}
          <code className="font-medium text-ink">{password}</code>.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {logins.map(({ role, email }) => {
          const Icon = ROLE_ICON[role];
          return (
            <li key={email} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full text-ink", ROLE_TINT[role])}>
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{ROLE_LABEL[role]}</span>
                <span className="block truncate text-sm text-ink-muted select-all">{email}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
