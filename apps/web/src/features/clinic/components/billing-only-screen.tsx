"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useSession } from "@/features/auth/access";
import { useSignOut } from "@/features/auth/api";
import { ClinicLogo } from "./clinic-logo";
import { PlanPanel } from "./plan-panel";

/**
 * B12 decision 25: the Owner of a clinic paused for an unpaid subscription sees only their plan, to pay and send the
 * receipt. No nav: every other route answers 403. Once Primolar confirms, the next check of /auth/me opens the app.
 */
export function BillingOnlyScreen() {
  const name = useSession()?.user.name;
  const signOut = useSignOut();
  const qc = useQueryClient();
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <ClinicLogo className="w-40" />
          <Button variant="outline" size="sm" className="ml-auto" onClick={signOut}>Sign out</Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 outline-none sm:px-6 lg:py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Your clinic is paused</h1>
          <p className="text-ink-muted">
            Hi {name}. Your Primolar subscription is unpaid, so your staff can&apos;t sign in. Every record is kept. Pay below and send your receipt;
            once Primolar confirms it, your clinic reopens.
          </p>
          <Button variant="link" className="h-auto px-0" onClick={() => void qc.invalidateQueries({ queryKey: ["session-user"] })}>
            Primolar confirmed it? Open the clinic
          </Button>
        </div>
        <PlanPanel />
      </main>
    </div>
  );
}
