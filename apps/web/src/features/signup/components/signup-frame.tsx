import Link from "next/link";
import type { ReactNode } from "react";
import { PrimolarLogo } from "@/components/brand";

/**
 * The public sign-up's frame (billing #4): Primolar's wordmark and colours, as on the operator sign-in, since no clinic
 * exists yet (platform #32 lists the places Primolar's logo may show; design-branding.test.ts admits this file).
 */
export function SignupFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/get-started" aria-label="Get started with Primolar" className="inline-flex rounded-md">
            <PrimolarLogo className="w-32" />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
        {children}
      </main>
    </div>
  );
}
