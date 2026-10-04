"use client";
import type { ReactNode } from "react";
import { roleCan, type Permission, type Role } from "@pedia/shared";
import { useSessionStore } from "@/stores/session-store";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  dentist: "Dentist",
  front_desk: "Front desk",
  parent: "Parent",
};

/** Where each role lands after signing in (Q3). */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/dashboard",
  dentist: "/appointments",
  front_desk: "/appointments",
  parent: "/portal",
};

/**
 * The permission each staff route needs, most specific first. The nav and the route gate both read
 * this, and ROLE_PERMISSIONS says who holds each permission.
 */
export const ROUTE_ACCESS: [RegExp, Permission][] = [
  [/^\/dashboard/, "today.view"], // every staff role; the finance part inside checks dashboard.view
  [/^\/appointments/, "appointments.view"],
  [/^\/patients\/new/, "patients.write"],
  [/^\/patients\/[^/]+\/edit/, "patients.write"],
  [/^\/patients\/[^/]+\/receipts/, "billing.view"],
  [/^\/patients/, "patients.view"],
  [/^\/billing/, "billing.collect"],
  [/^\/recall/, "recalls.manage"],
  [/^\/messages/, "messages.manage"],
  [/^\/documents/, "documents.issue"],
  [/^\/settings/, "settings.view"],
];

export const routePermission = (pathname: string) => ROUTE_ACCESS.find(([route]) => route.test(pathname))?.[1];

export const useSession = () => useSessionStore((s) => s.session);

/** `can("billing.collect")`: does the signed-in user hold it (at any scope, or at `all` when asked)? */
export function useCan() {
  const role = useSessionStore((s) => s.session?.user.role);
  return (permission: Permission, scope?: "all") => !!role && roleCan(role, permission, scope);
}

/** Shows children only with the permission. Tidiness, not security: the API refuses regardless. */
export function Can({ permission, children, fallback = null }: { permission: Permission; children: ReactNode; fallback?: ReactNode }) {
  return <>{useCan()(permission) ? children : fallback}</>;
}
