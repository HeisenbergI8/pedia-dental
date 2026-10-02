"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Role } from "@pedia/shared";
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
] as const;

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  dentist: "Dentist",
  front_desk: "Front desk",
};

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
          <label className="mt-8 flex flex-col gap-1 text-sm">
            <span className="text-ink-muted">Demo: view as</span>
            <select
              value={role}
              onChange={(e) => setRole(Role.parse(e.target.value))}
              className="h-11 rounded-md border border-line bg-white px-2"
            >
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        )}
      </aside>
      <main className="mx-auto w-full max-w-6xl p-6">{children}</main>
    </div>
  );
}
