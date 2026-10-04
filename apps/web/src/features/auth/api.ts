"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";
import { DemoAccounts, Session, type LoginInput, type LogoutInput, type SwitchUserInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { ROLE_HOME } from "./access";

export const authKeys = { demo: ["auth", "demo-accounts"] as const, signIn: ["auth", "sign-in"] as const };

/** Prototype only: the one-click accounts. Derived from the data, so refetched like any other query. */
export function useDemoAccounts() {
  return useQuery({ queryKey: authKeys.demo, queryFn: () => api("/auth/demo-accounts", DemoAccounts) });
}

/**
 * Signs in, drops every cached query from the previous user so nothing leaks
 * between accounts, and goes to the role's home page.
 */
export function useSignIn() {
  const qc = useQueryClient();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  // Load every role's home page ahead of time, so the switch after signing in doesn't wait for its code.
  useEffect(() => {
    for (const href of new Set(Object.values(ROLE_HOME))) router.prefetch(href);
  }, [router]);
  return useMutation({
    mutationKey: authKeys.signIn,
    mutationFn: (input: LoginInput) => api("/auth/login", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (session) => {
      signIn(session); // cookie first, so refetches below already carry the new user
      // Demo accounts are the same for everyone, so keep them: the login screen stays put until it leaves.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== authKeys.demo[0] });
      router.replace(ROLE_HOME[session.user.role]);
    },
  });
}

/**
 * Hands this device to another staff member after they enter their own PIN. Like signing in, it drops every cached
 * query, so nothing the last person opened is shown to the next one and the next reads are audited as the new
 * person. It then goes to the new person's home page, whatever page the last person had open, so a dentist always
 * starts on their appointments. The page itself remounts (AppShell keys it by user), so a half-filled form is cleared.
 */
export function useSwitchUser() {
  const qc = useQueryClient();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: (input: SwitchUserInput) => api("/auth/switch", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (session) => {
      signIn(session);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== authKeys.demo[0] });
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
