"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { DemoAccounts, Session, type LoginInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { ROLE_HOME } from "./access";

export const authKeys = { demo: ["auth", "demo-accounts"] as const };

/** Prototype only: the one-click accounts. Derived from the data, so refetched like any other query. */
export function useDemoAccounts() {
  return useQuery({ queryKey: authKeys.demo, queryFn: () => api("/auth/demo-accounts", DemoAccounts) });
}

/**
 * Signs in (or switches account), drops every cached query from the previous user so nothing leaks
 * between accounts, and goes to the role's home page.
 */
export function useSignIn() {
  const qc = useQueryClient();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: (input: LoginInput) => api("/auth/login", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (session) => {
      signIn(session); // cookie first, so refetches below already carry the new user
      qc.removeQueries();
      router.replace(ROLE_HOME[session.user.role]);
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const router = useRouter();
  const signOut = useSessionStore((s) => s.signOut);
  return () => {
    void api("/auth/logout", z.object({}), { method: "POST" }).catch(() => undefined);
    signOut();
    qc.removeQueries();
    router.replace("/login");
  };
}
