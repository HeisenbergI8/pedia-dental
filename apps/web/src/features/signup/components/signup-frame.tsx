import Link from "next/link";
import type { ReactNode } from "react";
import { PrimolarLogo } from "@/components/brand";
import { LegalLinks } from "@/features/legal/components/legal-links";

/**
 * The public sign-up's frame (billing #4): Primolar's wordmark and colours, as on the operator sign-in, since no clinic
 * exists yet (platform #32 lists the places Primolar's logo may show; design-branding.test.ts admits this file).
 */
/** `wide`: the Plans page's three plans side by side (D15); the forms keep the narrow column. */
export function SignupFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const width = wide ? "max-w-6xl" : "max-w-3xl";
  return (
    <div className="min-h-screen bg-ground">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto flex h-16 ${width} items-center justify-between gap-3 px-4 sm:px-6`}>
          <Link href="/get-started" aria-label="Get started with Primolar" className="inline-flex rounded-md">
            <PrimolarLogo className="w-32" />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" className={`mx-auto w-full ${width} space-y-8 px-4 py-8 sm:px-6 lg:py-12`}>
        {children}
      </main>
      <footer className={`mx-auto ${width} px-4 pb-10 sm:px-6`}>
        <LegalLinks />
      </footer>
    </div>
  );
}
