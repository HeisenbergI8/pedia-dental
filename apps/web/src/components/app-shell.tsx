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
import { KidsmileLogo, Loading } from "@/components/brand";
import { useNavigationPending } from "@/components/navigation-pending";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { routePermission, useCan } from "@/features/auth/access";
import { AccountMenu } from "@/features/auth/components/account-menu";
import { NoAccess } from "@/features/auth/components/access-gate";
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
    <Link href="/" aria-label="Kidsmile home" className="inline-flex rounded-md">
      <KidsmileLogo priority className={className} />
    </Link>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const can = useCan();
  const items = NAV.filter((n) => {
    const needs = routePermission(n.href);
    return !needs || can(needs);
  });

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon, soon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  active ? "bg-brand-subtle text-brand" : "text-ink-muted hover:bg-ground hover:text-ink",
                )}
              >
                {/* A bar as well as colour, so the current page doesn't rely on hue alone. */}
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand" />}
                <Icon className="size-4.5 shrink-0" aria-hidden />
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

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr] print:block">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop: a fixed sidebar. */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-line bg-surface px-3 pt-6 pb-5 lg:flex print:hidden!">
        <span aria-hidden className="brand-strip absolute inset-x-0 top-0 h-1" />
        <div className="px-2">
          <Brand className="w-44" />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
        <AccountMenu />
      </aside>

      {/* Tablet and phone: a top bar, with the same nav in a drawer. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden print:hidden">
        <span aria-hidden className="brand-strip absolute inset-x-0 top-0 h-1" />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" className="-ml-2 size-10">
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-6 p-4 pt-5">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand className="w-40" />
            <div className="flex-1 overflow-y-auto">
              <Nav onNavigate={() => setMenuOpen(false)} />
            </div>
            <AccountMenu />
          </SheetContent>
        </Sheet>
        <Brand className="w-28" />
        <div className="ml-auto">
          <AccountMenu compact />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
        {navigating && <Loading label="Opening…" />}
        {/* Hidden, not unmounted, so a navigation that doesn't land leaves the page as it was. */}
        <div hidden={navigating} className="contents">
          <RouteGate>{children}</RouteGate>
        </div>
      </main>
    </div>
  );
}
