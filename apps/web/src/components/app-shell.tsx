"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useRole } from "@/stores/role-store";
import { env } from "@/lib/env";

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: ["admin"] },
  { href: "/appointments", label: "Appointments", roles: ["admin", "dentist", "front_desk"] },
  { href: "/patients", label: "Patients", roles: ["admin", "dentist", "front_desk"] },
  { href: "/billing", label: "Billing", roles: ["admin", "front_desk"] },
  { href: "/recall", label: "Recalls", roles: ["admin", "front_desk"] },
  { href: "/messages", label: "Messages", roles: ["admin", "front_desk"] },
  { href: "/documents", label: "Documents", roles: ["admin", "dentist"] },
  { href: "/settings", label: "Settings", roles: ["admin", "dentist", "front_desk"] },
] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  dentist: "Dentist",
  front_desk: "Front desk",
};

/** Reseeds the mock database. Imported lazily, like providers.tsx, so mocks stay out of the bundle. */
function resetDemoData() {
  if (!window.confirm("Reset all demo data to the original seed?")) return;
  void import("@/mocks/db").then((m) => m.resetDb());
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role, setRole } = useRole();
  const items = NAV.filter((n) => (n.roles as readonly string[]).includes(role));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-white p-4 md:border-r md:border-b-0">
        <p className="mb-6 text-lg font-semibold text-brand">Clinic</p>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-3 py-2.5 whitespace-nowrap",
                pathname.startsWith(n.href) ? "bg-brand text-brand-ink" : "hover:bg-ground",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        {env.apiMocking && (
          <div className="mt-8 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="demo-role" className="text-ink-muted">Demo: view as</Label>
              <Select value={role} onValueChange={(v) => setRole(Role.parse(v))}>
                <SelectTrigger id="demo-role" className="w-full bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={resetDemoData}>
              Reset demo data
            </Button>
          </div>
        )}
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 p-6">{children}</main>
    </div>
  );
}
