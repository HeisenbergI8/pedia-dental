"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { z } from "zod";
import { AcknowledgementPrompt, DemoAccounts, LoginResult, Session, type AcknowledgeInput, type AcknowledgementKind, type ChangePasswordInput, type LoginInput, type LogoutInput, type SwitchUserInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";
import { ROLE_HOME } from "./access";

export const authKeys = { demo: ["auth", "demo-accounts"] as const, signIn: ["auth", "sign-in"] as const };

/** The one-click accounts: MSW, or an API with DEMO_LOGINS (else 404, B13c1 E4). Derived from the data, so refetched like any other query. */
export function useDemoAccounts() {
  return useQuery({ queryKey: authKeys.demo, queryFn: () => api("/auth/demo-accounts", DemoAccounts), retry: false });
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
    mutationFn: (input: LoginInput) => api("/auth/login", LoginResult, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (result) => {
      if ("choices" in result) return; // the sign-in form shows the clinic chooser (login-screen.tsx)
      const session = result;
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

/**
 * RequireSession re-reads this login's steps from /auth/me; a fresh session must replace that cached answer too, or
 * the old "must acknowledge" would put the step back on screen (privacy L6).
 */
const useTakeSession = () => {
  const qc = useQueryClient();
  const signIn = useSessionStore((s) => s.signIn);
  return (session: Session) => {
    qc.setQueryData(["session-user", session.user.id], session.user);
    signIn(session);
  };
};

/** Decision #21. The server answers with the session again, without `mustChangePassword`, so the app opens. */
export function useChangePassword() {
  const take = useTakeSession();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api("/auth/password", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: take,
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

/** Privacy P10: the page waiting for this login (terms, confidentiality or the clinic's notice). */
export function useAcknowledgementPrompt(kind: AcknowledgementKind) {
  // Not under "auth": sign-in keeps "auth" keys, and a parent's prompt holds the children's names and consents.
  return useQuery({ queryKey: ["acknowledgement", kind], queryFn: () => api("/auth/acknowledgement", AcknowledgementPrompt) });
}

/** Saves it and takes the fresh session, which names the next step or none, as useChangePassword does. */
export function useAcknowledge() {
  const take = useTakeSession();
  return useMutation({
    mutationFn: (input: AcknowledgeInput) => api("/auth/acknowledgement", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: take,
  });
}
