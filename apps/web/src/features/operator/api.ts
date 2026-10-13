"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AccountOverview,
  CreateAccountResult,
  OperatorSession,
  OwnerCandidate,
  type CreateAccountInput,
  type OperatorLoginInput,
  type Tier,
} from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useOperatorSessionStore } from "@/stores/operator-session-store";

export const operatorKeys = {
  all: ["operator"] as const,
  accounts: () => [...operatorKeys.all, "accounts"] as const,
  candidates: (id: string) => [...operatorKeys.all, "accounts", id, "staff"] as const,
};
const post = (body?: unknown) => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function useOperatorSignIn() {
  const signIn = useOperatorSessionStore((s) => s.signIn);
  return useMutation({ mutationFn: (input: OperatorLoginInput) => api("/operator/auth/login", OperatorSession, post(input)), onSuccess: signIn });
}

export function useOperatorSignOut() {
  const qc = useQueryClient();
  const signOut = useOperatorSessionStore((s) => s.signOut);
  return () => {
    void api("/operator/auth/logout", z.object({}), post()).catch(() => undefined);
    qc.removeQueries({ queryKey: operatorKeys.all });
    signOut();
  };
}

export const useAccounts = () => useQuery({ queryKey: operatorKeys.accounts(), queryFn: () => api("/operator/accounts", z.array(AccountOverview)) });

export const useOwnerCandidates = (id: string, enabled: boolean) =>
  useQuery({ queryKey: operatorKeys.candidates(id), queryFn: () => api(`/operator/accounts/${id}/staff`, z.array(OwnerCandidate)), enabled });

/** Every account action answers with the account's new row; the list refetches so counts and Owner stay true. */
function useAccountAction<I, O>(call: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: call, onSuccess: () => qc.invalidateQueries({ queryKey: operatorKeys.all }) });
}

export const useCreateAccount = () => useAccountAction((input: CreateAccountInput) => api("/operator/accounts", CreateAccountResult, post(input)));
export const useChangeTier = (id: string) =>
  useAccountAction((tier: Tier) => api(`/operator/accounts/${id}/tier`, AccountOverview, { method: "PUT", body: JSON.stringify({ tier }) }));
export const useSetSuspended = (id: string) =>
  useAccountAction((suspend: boolean) => api(`/operator/accounts/${id}/${suspend ? "suspend" : "reactivate"}`, AccountOverview, post()));
export const useTransferOwnership = (id: string) =>
  useAccountAction((staffId: string) => api(`/operator/accounts/${id}/owner`, AccountOverview, post({ staffId })));
