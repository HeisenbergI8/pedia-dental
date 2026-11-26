"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LoadingScreen, PrimolarLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOperatorSessionStore } from "@/stores/operator-session-store";
import { useOperatorSignOut, useReceiptsToCheck } from "../api";

/** True once the persisted operator session has been read, so a signed-in operator is never bounced to sign-in. */
function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useOperatorSessionStore.persist.onFinishHydration(onChange),
    () => useOperatorSessionStore.persist.hasHydrated(),
    () => false,
  );
}

/** The console's gate: no operator session goes to /operator/login. UI only: the API refuses anyway (mocks/access.ts). */
export function RequireOperator({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const signedIn = !!useOperatorSessionStore((s) => s.session);
  const router = useRouter();
  useEffect(() => {
    if (hydrated && !signedIn) router.replace("/operator/login");
  }, [hydrated, signedIn, router]);
  if (!hydrated || !signedIn) return <LoadingScreen />;
  return <>{children}</>;
}

const NAV = [
  { href: "/operator", label: "Clinic accounts", match: (p: string) => p === "/operator" || p.startsWith("/operator/accounts") },
  { href: "/operator/signups", label: "Sign-ups", match: (p: string) => p.startsWith("/operator/signups") },
  { href: "/operator/payments", label: "Payments to check", match: (p: string) => p.startsWith("/operator/payments") },
  { href: "/operator/prices", label: "Price list", match: (p: string) => p.startsWith("/operator/prices") },
];

/** Primolar's console frame (decision #32): its own wordmark and colours, never a clinic's. Four areas in the header. */
export function OperatorShell({ children }: { children: ReactNode }) {
  const operator = useOperatorSessionStore((s) => s.session?.operator);
  const signOut = useOperatorSignOut();
  const pathname = usePathname();
  const waiting = useReceiptsToCheck().data?.length ?? 0;
  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/operator" aria-label="Clinic accounts" className="inline-flex rounded-md">
            <PrimolarLogo className="w-32" />
          </Link>
          <span className="rounded-full bg-selected px-2.5 py-0.5 text-xs font-semibold text-ink-muted">Console</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-ink-muted sm:inline">{operator?.name}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <nav aria-label="Console" className="border-b border-line bg-surface">
        {/* `relative` keeps the badge's sr-only words inside the scroll box; otherwise they widen the page on a phone. */}
        {/* A phone gets four equal columns whose words wrap, so every area and the payments count stay in view. */}
        <ul className="relative mx-auto grid max-w-5xl grid-cols-4 px-2 sm:flex sm:gap-1 sm:px-6">
          {NAV.map((n) => {
            const here = n.match(pathname);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={here ? "page" : undefined}
                  className={cn("flex min-h-11 h-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 border-b-2 px-1 py-1.5 text-center text-sm leading-tight font-semibold sm:inline-flex sm:h-11 sm:flex-nowrap sm:px-3 sm:py-0 sm:whitespace-nowrap", here ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink")}
                >
                  {n.label}
                  {/* B12 decision 8: how many wait, as a number beside the words; hidden at 0. */}
                  {n.href === "/operator/payments" && waiting > 0 && (
                    <span className="rounded-full bg-brand px-1.5 text-xs text-brand-ink tabular-nums">
                      {waiting}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-6 outline-none sm:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
