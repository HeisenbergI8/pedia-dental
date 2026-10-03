"use client";
import { usePatients } from "@/features/patients/api";
import { useSessionStore } from "@/stores/session-store";

/** The signed-in parent's children (the API returns only theirs) and the one being viewed. */
export function useChildren() {
  const { data: kids = [], isLoading, error, refetch, isRefetching } = usePatients();
  const activeId = useSessionStore((s) => s.activeChildId);
  const setActive = useSessionStore((s) => s.setActiveChild);
  return { kids, child: kids.find((k) => k.id === activeId) ?? kids[0], setActive, isLoading, error, refetch, isRefetching };
}

/** For portal sections, which PortalShell renders only once a child is loaded. */
export function useActiveChild() {
  const { child } = useChildren();
  if (!child) throw new Error("Portal sections render inside PortalShell, after a child is loaded");
  return child;
}
