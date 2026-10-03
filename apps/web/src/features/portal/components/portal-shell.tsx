"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarDaysIcon, ClipboardListIcon, HeartPulseIcon, HomeIcon, MenuIcon, ReceiptIcon, SmileIcon, UploadIcon } from "lucide-react";
import { KidsmileLogo, Loading, PageLoading } from "@/components/brand";
import { useNavigationPending } from "@/components/navigation-pending";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

/** The phone tab bar's four: what parents open most. The rest sit under More. */
const PRIMARY = ["/portal", "/portal/appointments", "/portal/billing"];
const isActive = (pathname: string, href: string) => (href === "/portal" ? pathname === href : pathname.startsWith(href));

/** Phones: Home, Appointments, Bills and More, in thumb reach. Labels stay, so icons aren't a riddle. */
function PortalBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = SECTIONS.filter((s) => PRIMARY.includes(s.href));
  const more = SECTIONS.filter((s) => !PRIMARY.includes(s.href));
  const inMore = more.some((s) => isActive(pathname, s.href));
  const tab = "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium";
  const pill = (on: boolean) => cn("flex h-7 w-12 items-center justify-center rounded-full", on && "bg-brand-subtle");
  return (
    <>
      <nav aria-label="Portal" data-bottom-nav className="pb-safe fixed inset-x-0 bottom-0 z-(--z-header) border-t border-line bg-surface/95 px-2 pt-1 backdrop-blur md:hidden">
        <ul className="flex gap-1">
          {primary.map(({ href, label, icon: Icon }) => {
            const on = isActive(pathname, href);
            return (
              <li key={href} className="flex flex-1">
                <Link href={href} aria-current={on ? "page" : undefined} className={cn(tab, on ? "text-brand" : "text-ink-muted")}>
                  <span className={pill(on)}>
                    <Icon className="size-5" aria-hidden />
                  </span>
                  {label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} aria-expanded={moreOpen} className={cn(tab, inMore ? "text-brand" : "text-ink-muted")}>
              <span className={pill(inMore)}>
                <MenuIcon className="size-5" aria-hidden />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">Other parts of the portal</SheetDescription>
          </SheetHeader>
          <ul className="space-y-1 px-4 pb-4">
            {more.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium",
                    isActive(pathname, href) ? "bg-brand-subtle text-brand" : "hover:bg-ground",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const navigating = useNavigationPending();
  const { kids, child, setActive, isLoading, error, refetch, isRefetching } = useChildren();

  return (
    <div className="min-h-screen bg-ground">
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-(--z-header) border-b border-line bg-surface/95 backdrop-blur">
        <span aria-hidden className="brand-strip absolute inset-x-0 top-0 h-1" />
        <div className="mx-auto flex h-18 max-w-3xl items-center gap-3 px-4 pt-1 sm:px-6">
          <Link href="/portal" aria-label="Kidsmile home" className="inline-flex rounded-md">
            <KidsmileLogo priority className="w-36 sm:w-44" />
          </Link>
          <div className="ml-auto">
            <AccountMenu compact />
          </div>
        </div>
        {/* Tablets and up: the sections as tabs under the logo. Phones use the bottom tab bar. */}
        <nav aria-label="Portal sections" className="mx-auto hidden max-w-3xl overflow-x-auto px-2 sm:px-4 md:block">
          <ul className="flex w-max">
            {SECTIONS.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
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
          <ErrorState what="your family's records" onRetry={() => refetch()} retrying={isRefetching} />
        ) : !child ? (
          <EmptyState icon={SmileIcon} title="No children are linked to your account">
            Ask the clinic to add you as your child&apos;s guardian.
          </EmptyState>
        ) : (
          <>
            {navigating && <PageLoading />}
            <div hidden={navigating} className="contents">
              {children}
            </div>
          </>
        )}
        {/* Keeps the end of the page clear of the bottom tab bar. */}
        <div aria-hidden className="h-(--bottom-nav-h)" />
      </main>
      <PortalBottomNav />
    </div>
  );
}
