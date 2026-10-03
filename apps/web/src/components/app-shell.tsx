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
  SmileIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Role } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useRole } from "@/stores/role-store";
import { env } from "@/lib/env";

type NavItem = { href: string; label: string; icon: LucideIcon; roles: readonly Role[]; soon?: true };

/** `soon` marks screens that still render ComingSoon, so staff aren't surprised by an empty page. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, roles: ["admin"], soon: true },
  { href: "/appointments", label: "Appointments", icon: CalendarDaysIcon, roles: ["admin", "dentist", "front_desk"] },
  { href: "/patients", label: "Patients", icon: UsersIcon, roles: ["admin", "dentist", "front_desk"] },
  { href: "/billing", label: "Billing", icon: ReceiptIcon, roles: ["admin", "front_desk"], soon: true },
  { href: "/recall", label: "Recalls", icon: BellRingIcon, roles: ["admin", "front_desk"], soon: true },
  { href: "/messages", label: "Messages", icon: MessageSquareIcon, roles: ["admin", "front_desk"], soon: true },
  { href: "/documents", label: "Documents", icon: FileTextIcon, roles: ["admin", "dentist"], soon: true },
  { href: "/settings", label: "Settings", icon: SettingsIcon, roles: ["admin", "dentist", "front_desk"] },
];

const ROLE_LABEL: Record<Exclude<Role, "parent">, string> = {
  admin: "Admin",
  dentist: "Dentist",
  front_desk: "Front desk",
};

/** Reseeds the mock database. Imported lazily, like providers.tsx, so mocks stay out of the bundle. */
function resetDemoData() {
  if (!window.confirm("Reset all demo data? Every patient, visit and appointment you added will be replaced by the original sample data.")) return;
  void import("@/mocks/db").then((m) => m.resetDb());
}

function Brand() {
  return (
    <Link href="/patients" className="flex items-center gap-2.5 rounded-md font-semibold">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-ink">
        <SmileIcon className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        Pedia Dental
        <span className="block text-xs font-normal text-ink-muted">Clinic</span>
      </span>
    </Link>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useRole();
  const items = NAV.filter((n) => n.roles.includes(role));

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

function DemoControls() {
  const { role, setRole } = useRole();
  if (!env.apiMocking) return null;
  return (
    <div className="space-y-3 rounded-lg border border-dashed border-line-strong p-3">
      <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">Demo controls</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="demo-role" className="text-sm">View as</Label>
        <Select value={role} onValueChange={(v) => setRole(Role.parse(v))}>
          <SelectTrigger id="demo-role" className="w-full bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button variant="ghost" size="sm" className="w-full text-ink-muted" onClick={resetDemoData}>
        Reset demo data
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr] print:block">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-brand px-4 py-2 text-brand-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop: a fixed sidebar. */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-8 border-r border-line bg-surface px-3 py-5 lg:flex print:hidden!">
        <div className="px-2">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Nav />
        </div>
        <DemoControls />
      </aside>

      {/* Tablet and phone: a top bar, with the same nav in a drawer. */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden print:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu" className="-ml-2 size-10">
              <MenuIcon className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-6 p-4 pt-5">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Brand />
            <div className="flex-1 overflow-y-auto">
              <Nav onNavigate={() => setMenuOpen(false)} />
            </div>
            <DemoControls />
          </SheetContent>
        </Sheet>
        <Brand />
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  );
}
