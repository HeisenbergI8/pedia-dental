"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AccountOverview,
  CreateAccountResult,
  OperatorSession,
  OwnerCandidate,
  PaymentQrView,
  PriceList,
  ReceiptToCheck,
  Signup,
  SubscriptionView,
  type ConfirmReceiptInput,
  type CreateAccountInput,
  type OperatorLoginInput,
  type PaymentQrInput,
  type RecordUpfrontPaymentInput,
  type SetBrandingInput,
  type SignupInput,
  type Tier,
} from "@pedia/shared";
import { imageFormData } from "@/features/payments/form-data";
import { signupFormData } from "@/features/signup/form-data";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { useOperatorSessionStore } from "@/stores/operator-session-store";

export const operatorKeys = {
  all: ["operator"] as const,
  accounts: () => [...operatorKeys.all, "accounts"] as const,
  candidates: (id: string) => [...operatorKeys.all, "accounts", id, "staff"] as const,
  subscription: (id: string) => [...operatorKeys.all, "accounts", id, "subscription"] as const,
  signups: () => [...operatorKeys.all, "signups"] as const,
  prices: () => [...operatorKeys.all, "prices"] as const,
  paymentQr: () => [...operatorKeys.all, "payment-qr"] as const,
  receipts: () => [...operatorKeys.all, "receipts"] as const,
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

/** Every console action refetches the whole console: approving changes both the sign-ups and the accounts list. */
function useAccountAction<I, O>(call: (input: I) => Promise<O>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: call, onSuccess: () => qc.invalidateQueries({ queryKey: operatorKeys.all }) });
}

/** Multipart: the logo and reference images are files (billing #16: the same branding choices as the form). */
export const useCreateAccount = () =>
  useAccountAction(({ input, logo, references }: { input: CreateAccountInput; logo?: File; references?: File[] }) =>
    api("/operator/accounts", CreateAccountResult, { method: "POST", body: signupFormData(input, { logo, references }) }),
  );
export const useChangeTier = (id: string) =>
  useAccountAction((tier: Tier) => api(`/operator/accounts/${id}/tier`, AccountOverview, { method: "PUT", body: JSON.stringify({ tier }) }));
export const useSetSuspended = (id: string) =>
  useAccountAction((suspend: boolean) => api(`/operator/accounts/${id}/${suspend ? "suspend" : "reactivate"}`, AccountOverview, post()));
export const useTransferOwnership = (id: string) =>
  useAccountAction((staffId: string) => api(`/operator/accounts/${id}/owner`, AccountOverview, post({ staffId })));

export const useSignups = () => useQuery({ queryKey: operatorKeys.signups(), queryFn: () => api("/operator/signups", z.array(Signup)) });
export const useOperatorPrices = () => useQuery({ queryKey: operatorKeys.prices(), queryFn: () => api("/operator/prices", PriceList) });

/** For <img>: the browser sends the operator cookie with it, as the clinic logo does with the clinic's. */
export const signupFileUrl = (signupId: string, key: string) => `${env.apiUrl}/operator/signups/${signupId}/files/${encodeURIComponent(key)}`;

export const useFixSignup = (id: string) =>
  useAccountAction(({ input, logo, references }: { input: SignupInput; logo?: File; references: File[] }) =>
    api(`/operator/signups/${id}`, Signup, { method: "PUT", body: signupFormData(input, { logo, references }) }),
  );
export const useRecordPayment = (id: string) =>
  useAccountAction((input: RecordUpfrontPaymentInput) => api(`/operator/signups/${id}/payment`, Signup, post(input)));
export const useRejectSignup = (id: string) => useAccountAction((reason: string) => api(`/operator/signups/${id}/reject`, Signup, post({ reason })));
export const useApproveSignup = (id: string) => useAccountAction(() => api(`/operator/signups/${id}/approve`, CreateAccountResult, post()));
export const useSavePrices = () => useAccountAction((prices: PriceList) => api("/operator/prices", PriceList, { method: "PUT", body: JSON.stringify(prices) }));
export const useSetBranding = (accountId: string) =>
  useAccountAction(({ input, logo }: { input: SetBrandingInput; logo?: File }) =>
    api(`/operator/accounts/${accountId}/branding`, AccountOverview, { method: "PUT", body: signupFormData(input, { logo }) }),
  );

/** Billing #31: the clinic's subscription, state and payment history (S14). */
export const useAccountSubscription = (id: string) =>
  useQuery({ queryKey: operatorKeys.subscription(id), queryFn: () => api(`/operator/accounts/${id}/subscription`, SubscriptionView) });
/** Billing #29, S5: one month, marked by hand. Not `useRecordPayment`, which is the sign-up's upfront payment. */
export const useRecordSubscriptionPayment = (id: string) =>
  useAccountAction((input: RecordUpfrontPaymentInput) => api(`/operator/accounts/${id}/subscription/payments`, SubscriptionView, post(input)));
/** Billing #30, S7. */
export const useCancelSubscription = (id: string) =>
  useAccountAction(() => api(`/operator/accounts/${id}/subscription/cancel`, SubscriptionView, post()));

/** B12 decision 5: Primolar's one payment QR. null until the first upload. */
export const usePaymentQr = () => useQuery({ queryKey: operatorKeys.paymentQr(), queryFn: () => api("/operator/payment-qr", PaymentQrView.nullable()) });
export const useSavePaymentQr = () =>
  useAccountAction(({ input, file }: { input: PaymentQrInput; file?: File }) =>
    api("/operator/payment-qr", PaymentQrView.nullable(), { method: "PUT", body: imageFormData(input, file) }),
  );
/** Decision 8: Payments to check. Refetched on focus: the console's only notice of a new receipt (no email). */
export const useReceiptsToCheck = () =>
  useQuery({ queryKey: operatorKeys.receipts(), queryFn: () => api("/operator/receipts", z.array(ReceiptToCheck)), refetchOnWindowFocus: true });
export const receiptImageUrl = (id: string) => `${env.apiUrl}/operator/receipts/${id}/image`;
/** Both refetch the whole console, so the account's subscription and the sign-up show the decision. */
export const useConfirmReceipt = (id: string) =>
  useAccountAction((input: ConfirmReceiptInput) => api(`/operator/receipts/${id}/confirm`, ReceiptToCheck, post(input)));
export const useRejectReceipt = (id: string) => useAccountAction((reason: string) => api(`/operator/receipts/${id}/reject`, ReceiptToCheck, post({ reason })));
