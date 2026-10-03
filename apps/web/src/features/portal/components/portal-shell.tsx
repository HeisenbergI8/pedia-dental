"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CalendarDaysIcon, ClipboardListIcon, HeartPulseIcon, HomeIcon, ReceiptIcon, SmileIcon, UploadIcon } from "lucide-react";
import { KidsmileLogo, Loading } from "@/components/brand";
import { useNavigationPending } from "@/components/navigation-pending";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { cn } from "@/lib/utils";
import { useChildren } from "../use-child";

const SECTIONS = [
  { href: "/portal", label: "Home", icon: HomeIcon },
  { href: "/portal/appointments", label: "Appointments", icon: CalendarDaysIcon },
  { href: "/portal/plan", label: "Treatment plan", icon: ClipboardListIcon },
  { href: "/portal/billing", label: "Bills", icon: ReceiptIcon },
  { href: "/portal/care", label: "Care instructions", icon: HeartPulseIcon },
  { href: "/portal/uploads", label: "Uploads", icon: UploadIcon },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navigating = useNavigationPending();
  const { kids, child, setActive, isLoading, error } = useChildren();

  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <span aria-hidden className="brand-strip absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto flex h-18 max-w-3xl items-center gap-3 px-4 pt-1 sm:px-6">
          <Link href="/portal" aria-label="Kidsmile home" className="inline-flex rounded-md">
            <KidsmileLogo priority className="w-36 sm:w-44" />
          </Link>
          <div className="ml-auto">
            <AccountMenu compact />
          </div>
        </div>
        {/* Scrolls sideways on a phone rather than wrapping, like the patient record tabs. */}
        <nav aria-label="Portal" className="mx-auto max-w-3xl overflow-x-auto px-2 sm:px-4">
          <ul className="flex w-max">
            {SECTIONS.map(({ href, label, icon: Icon }) => {
              const active = href === "/portal" ? pathname === href : pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
                      active ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-3xl space-y-6 px-4 py-6 text-base outline-none sm:px-6">
        {kids.length > 1 && child && (
          <div role="group" aria-label="Whose records to show" className="flex flex-wrap gap-2">
            {kids.map((k) => (
              <Button key={k.id} className="min-h-11 rounded-full px-5" variant={k.id === child.id ? "default" : "outline"} aria-pressed={k.id === child.id} onClick={() => setActive(k.id)}>
                {k.firstName}
              </Button>
            ))}
          </div>
        )}
        {isLoading ? (
          <Loading label="Loading your family's records…" />
        ) : error ? (
          <p role="alert" className="text-danger">We couldn&apos;t load your family&apos;s records. Refresh the page to try again.</p>
        ) : !child ? (
          <EmptyState icon={SmileIcon} title="No children are linked to your account">
            Ask the clinic to add you as your child&apos;s guardian.
          </EmptyState>
        ) : (
          <>
            {navigating && <Loading label="Opening…" />}
            <div hidden={navigating} className="contents">
              {children}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
