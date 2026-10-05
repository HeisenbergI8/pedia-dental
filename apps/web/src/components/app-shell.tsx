"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BellRingIcon,
  CalendarDaysIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MessageSquareIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@pedia/shared";
import { BottomTabIcon, bottomTabClass } from "@/components/bottom-tab";
import { PageLoading, PrimoralLogo, PrimoralMark } from "@/components/brand";
import { useNavigationPending } from "@/components/navigation-pending";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { routePermission, useCan, useSession } from "@/features/auth/access";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { NoAccess } from "@/features/auth/components/access-gate";
import { PatientSearch } from "@/features/patients/components/patient-search";
import { cn } from "@/lib/utils";

/** Who sees an item is decided by ROUTE_ACCESS + ROLE_PERMISSIONS, never here. */
type NavItem = { href: string; label: string; icon: LucideIcon; soon?: true };

/** `soon` marks screens that still render ComingSoon, so staff aren't surprised by an empty page. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/appointments", label: "Appointments", icon: CalendarDaysIcon },
  { href: "/patients", label: "Patients", icon: UsersIcon },
  { href: "/billing", label: "Billing", icon: ReceiptIcon },
  { href: "/recall", label: "Recalls", icon: BellRingIcon },
  { href: "/messages", label: "Messages", icon: MessageSquareIcon },
  { href: "/documents", label: "Documents", icon: FileTextIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Primoral home" className="inline-flex rounded-md">
      <PrimoralLogo className={className} />
    </Link>
  );
}

/** The items this role may open, in NAV order. */
function useNavItems() {
  const can = useCan();
  return NAV.filter((n) => {
    const needs = routePermission(n.href);
    return !needs || can(needs);
  });
}

const isActive = (pathname: string, href: string) => pathname.startsWith(href);

/**
 * The phone bar's four shortcuts, where a role's daily work differs from menu order. Front desk lands on
 * Appointments and makes recall calls daily; Today at a glance stays one tap away under More. Data, not `if`s.
 */
const BOTTOM_NAV: Partial<Record<Role, string[]>> = {
  front_desk: ["/appointments", "/patients", "/recall", "/billing"],
};

/** The full list: the desktop sidebar and the phone "More" drawer. */
function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = useNavItems();

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon, soon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-(--control-h) items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-(--duration-fast)",
                  // A filled pill and bold text as well as the brand icon, so the current page doesn't rely on hue alone.
                  active ? "bg-selected font-bold text-ink" : "font-medium text-ink-muted hover:bg-selected hover:text-ink",
                )}
              >
                <Icon className={cn("size-4.5 shrink-0", active && "text-brand")} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <span className="flex-1">{label}</span>
                {soon && <span className="text-xs font-normal text-ink-muted">Soon</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Tablets (md to lg): an icon rail with labels, so the nav is one tap away without a drawer. */
function Rail() {
  const pathname = usePathname();
  const items = useNavItems();
  const can = useCan();
  return (
    <aside className="sticky top-0 hidden h-screen flex-col items-stretch gap-3 border-r border-line bg-surface px-2 pt-5 pb-4 md:flex lg:hidden print:hidden!">
      <Link href="/" aria-label="Primoral home" className="mx-auto rounded-lg">
        <PrimoralMark />
      </Link>
      {can("patients.view") && <PatientSearch variant="rail" />}
      <nav aria-label="Main" className="flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-xs transition-colors duration-(--duration-fast)",
                    active ? "bg-selected font-bold text-ink" : "font-medium text-ink-muted hover:bg-selected hover:text-ink",
                  )}
                >
                  <Icon className={cn("size-5", active && "text-brand")} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex justify-center">
        <AccountMenu variant="rail" />
      </div>
    </aside>
  );
}

/** Phones: the four most-used destinations for this role in thumb reach, and More for the rest. */
function BottomNav({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();
  const items = useNavItems();
  const pinned = BOTTOM_NAV[useSession()?.user.role ?? "parent"];
  const primary = pinned ? pinned.flatMap((href) => items.filter((n) => n.href === href)) : items.slice(0, 4);
  const overflow = items.filter((n) => !primary.includes(n));
  const inOverflow = overflow.some((n) => isActive(pathname, n.href));
  return (
    <nav
      aria-label="Quick"
      data-bottom-nav
      className="pb-safe fixed inset-x-0 bottom-0 z-(--z-header) border-t border-line bg-surface/95 px-2 backdrop-blur md:hidden print:hidden"
    >
      <ul className="flex gap-1">
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex flex-1">
              <Link href={href} aria-current={active ? "page" : undefined} className={bottomTabClass(active)}>
                <BottomTabIcon icon={Icon} active={active} />
                {label}
              </Link>
            </li>
          );
        })}
        {overflow.length > 0 && (
          <li className="flex flex-1">
            <button type="button" onClick={onMore} aria-expanded={moreOpen} className={bottomTabClass(inOverflow)}>
              <BottomTabIcon icon={MenuIcon} active={inOverflow} />
              More
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}

/** A pasted URL for a page this role can't use shows NoAccess instead, inside the shell. */
function RouteGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const can = useCan();
  const needs = routePermission(pathname);
  return needs && !can(needs) ? <NoAccess /> : <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigating = useNavigationPending();
  const can = useCan();
  const canSearch = can("patients.view");
  // A new person on this device gets a fresh page: nothing half-typed carries over under their name.
  const userId = useSession()?.user.id;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[6.5rem_1fr] lg:grid-cols-[15rem_1fr] print:block">
      <a
        href="#main"
        className="sr-only z-(--z-toast) rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop: the full sidebar. */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-5 border-r border-line bg-surface px-3.5 pt-5 pb-4 lg:flex print:hidden!">
        <div className="px-2">
          <Brand className="w-44" />
        </div>
        {canSearch && <PatientSearch variant="field" />}
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
        <AccountMenu />
      </aside>

      <Rail />

      {/* Phones: a slim top bar (brand, search, account) and the bottom nav. */}
      <header className="sticky top-0 z-(--z-header) flex h-14 items-center gap-1 border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden print:hidden">
        <Brand className="w-28" />
        <div className="ml-auto flex items-center gap-1">
          {canSearch && <PatientSearch variant="icon" />}
          <AccountMenu variant="bar" />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
        {navigating && <PageLoading />}
        {/* Hidden, not unmounted, so a navigation that doesn't land leaves the page as it was. */}
        <div hidden={navigating} className="contents">
          <RouteGate key={userId}>{children}</RouteGate>
        </div>
        {/* Keeps the end of the page clear of the bottom nav. */}
        <div aria-hidden className="h-(--bottom-nav-h)" />
      </main>

      <BottomNav onMore={() => setMenuOpen(true)} moreOpen={menuOpen} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 gap-6 p-4 pt-5">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Brand className="w-40" />
          <div className="flex-1 overflow-y-auto">
            <Nav onNavigate={() => setMenuOpen(false)} />
          </div>
          <AccountMenu />
        </SheetContent>
      </Sheet>
    </div>
  );
}
