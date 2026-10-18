"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { DemoTexts, PasswordLink, PortalAccess, Session, type PasswordResetInput, type SetPasswordInput } from "@pedia/shared";
import { ROLE_HOME } from "@/features/auth/access";
import { messageKeys } from "@/features/messages/api";
import { api } from "@/lib/api-client";
import { useSessionStore } from "@/stores/session-store";

export const portalKeys = { access: (patientId: string) => ["portal-access", patientId] as const, demoTexts: ["auth", "demo-texts"] as const };

/** Each guardian's portal status on the child's Overview (B11 decision 17). Staff with portal.manage only. */
export function usePortalAccess(patientId: string, enabled: boolean) {
  return useQuery({ queryKey: portalKeys.access(patientId), queryFn: () => api(`/patients/${patientId}/portal-access`, z.array(PortalAccess)), enabled });
}

/** Invite or resend (`invite`), or turn off (`off`). The text joins the child's message log. */
export function usePortalAction(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianId, action }: { guardianId: string; action: "invite" | "off" }) =>
      api(`/patients/${patientId}/guardians/${guardianId}/portal-${action}`, PortalAccess, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: portalKeys.access(patientId) });
      void qc.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}

/** What a texted link is for. Undefined token: the page found none in its address. */
export function usePasswordLink(token: string | undefined) {
  return useQuery({
    queryKey: ["password-link", token],
    queryFn: () => api("/auth/password-link", PasswordLink, { method: "POST", body: JSON.stringify({ token }) }),
    enabled: !!token,
    retry: false,
  });
}

/** Sets the password from a link and signs in, as useSignIn does; the portal then asks for the notice (decision 22). */
export function useSetPassword() {
  const qc = useQueryClient();
  const router = useRouter();
  const signIn = useSessionStore((s) => s.signIn);
  return useMutation({
    mutationFn: (input: SetPasswordInput) => api("/auth/password-link/accept", Session, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (session) => {
      signIn(session);
      qc.removeQueries();
      router.replace(ROLE_HOME[session.user.role]);
    },
  });
}

/** Decision 19: the answer never says whether the number has an account. */
export function useRequestReset() {
  return useMutation({
    mutationFn: (input: PasswordResetInput) => api("/auth/password-reset", z.object({}), { method: "POST", body: JSON.stringify(input) }),
  });
}

/** Demo deployments only (B11 E6): the links the demo would have texted. `enabled` once the backend is known to be a demo. */
export function useDemoTexts(enabled: boolean) {
  return useQuery({ queryKey: portalKeys.demoTexts, queryFn: () => api("/auth/demo-texts", DemoTexts), enabled });
}
