"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PriceList, SignupStatusView, type SignupInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
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
    mutationFn: ({ input, logo, references }: { input: SignupInput; logo?: File; references: File[] }) =>
      api("/signups", SignupStatusView, { method: "POST", body: signupFormData(input, { logo, references }) }),
  });

/** A1: the thank-you page and every later check. A 404 is an answer ("no such reference"), so no retry. */
export const useSignupStatus = (reference: string) =>
  useQuery({
    queryKey: signupKeys.status(reference),
    queryFn: () => api(`/signups/${encodeURIComponent(reference)}`, SignupStatusView),
    retry: false,
  });
