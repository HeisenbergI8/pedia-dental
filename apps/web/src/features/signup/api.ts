"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PriceList, SignupStatusView, type GetStartedInput, type PaymentQrView, type ReceiptUploadInput } from "@pedia/shared";
import { imageFormData } from "@/features/payments/form-data";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { signupFormData } from "./form-data";

/** Public: never under "operator", and no session to lose, so the global 401 handler never fires for these. */
export const signupKeys = {
  all: ["signup"] as const,
  prices: () => [...signupKeys.all, "prices"] as const,
  status: (reference: string) => [...signupKeys.all, "status", reference.toUpperCase()] as const,
};

export const usePrices = () => useQuery({ queryKey: signupKeys.prices(), queryFn: () => api("/signups/prices", PriceList) });

export const useSubmitSignup = () =>
  useMutation({
    mutationFn: ({ input, logo, references }: { input: GetStartedInput; logo?: File; references: File[] }) =>
      api("/signups", SignupStatusView, { method: "POST", body: signupFormData(input, { logo, references }) }),
  });

/** A1: the thank-you page and every later check. A 404 is an answer ("no such reference"), so no retry. */
export const useSignupStatus = (reference: string) =>
  useQuery({
    queryKey: signupKeys.status(reference),
    queryFn: () => api(`/signups/${encodeURIComponent(reference)}`, SignupStatusView),
    retry: false,
  });

/** B12 decision 7: the receipt for the whole quote, from the status page. The answer is the refreshed status. */
export function useUploadSignupReceipt(reference: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, file }: { input: ReceiptUploadInput; file: File }) =>
      api(`/signups/${encodeURIComponent(reference)}/receipts`, SignupStatusView, { method: "POST", body: imageFormData(input, file) }),
    onSuccess: (view) => qc.setQueryData(signupKeys.status(reference), view),
  });
}

/** Primolar's QR, public. A new address per upload (`updatedAt`), so a replaced QR is never served from cache. */
export const paymentQrImageUrl = (qr: PaymentQrView) => `${env.apiUrl}/signups/payment-qr/image?v=${encodeURIComponent(qr.updatedAt)}`;
