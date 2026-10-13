"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Invoice, Payment, type ApplyCreditInput, type CreateInvoiceInput, type PaymentMethod, type RecordPaymentInput } from "@pedia/shared";
import { branchParam } from "@/features/dashboard/api";
import { api } from "@/lib/api-client";
import { patientKeys } from "@/features/patients/api";

export const billingKeys = {
  all: ["billing"] as const,
  invoices: (patientId: string) => [...billingKeys.all, "invoices", patientId] as const,
  payments: (patientId: string) => [...billingKeys.all, "payments", patientId] as const,
  day: (date: string, branch?: string) => [...billingKeys.all, "day", date, branch ?? "device"] as const,
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  bank_transfer: "Bank transfer",
  account_credit: "From deposit",
};

/** Oldest first. */
export function useInvoices(patientId: string, opts?: { enabled?: boolean }) {
  return useQuery({ queryKey: billingKeys.invoices(patientId), queryFn: () => api(`/patients/${patientId}/invoices`, z.array(Invoice)), ...opts });
}

/** Every payment and refund for the patient, oldest first. */
export function usePayments(patientId: string) {
  return useQuery({ queryKey: billingKeys.payments(patientId), queryFn: () => api(`/patients/${patientId}/payments`, z.array(Payment)) });
}

/** The daily collection list. `date` is YYYY-MM-DD. */
export function useDailyPayments(date: string, branch?: string) {
  return useQuery({
    queryKey: billingKeys.day(date, branch),
    queryFn: () => api(`/payments?date=${date}${branchParam(branch)}`, z.array(Payment)),
  });
}

export function useCreateInvoice(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) => api(`/patients/${patientId}/invoices`, Invoice, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.all });
      qc.invalidateQueries({ queryKey: patientKeys.all }); // the header's balance and the list's Balance due
    },
  });
}

/** A positive amount records a payment, a negative one a refund. */
export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, ...input }: RecordPaymentInput & { invoiceId: string }) =>
      api(`/invoices/${invoiceId}/payments`, Payment, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.all });
      qc.invalidateQueries({ queryKey: patientKeys.all }); // the header's balance and the list's Balance due
    },
  });
}

/** Money taken before treatment is billed (a positive amount), or a deposit refund (negative). */
export function useRecordDeposit(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => api(`/patients/${patientId}/deposits`, Payment, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.all });
      qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

/** Moves deposit money onto an invoice (positive) or back to the deposit (negative). */
export function useApplyCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, ...input }: ApplyCreditInput & { invoiceId: string }) =>
      api(`/invoices/${invoiceId}/apply-credit`, Payment, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: billingKeys.all });
      qc.invalidateQueries({ queryKey: patientKeys.all }); // the header's balance and the list's Balance due
    },
  });
}

/** How a row reads in a history: "Cash payment", "GCash refund", "Deposit", "Deposit refund", "Paid from deposit"… */
export function paymentLabel(p: Payment): string {
  if (p.method === "account_credit") {
    if (p.invoiceId) return p.amount > 0 ? "Paid from deposit" : "Returned to deposit";
    return p.amount < 0 ? "Applied to an invoice" : "Returned from an invoice";
  }
  if (!p.invoiceId) return `${METHOD_LABEL[p.method]} deposit${p.amount < 0 ? " refund" : ""}`;
  return `${METHOD_LABEL[p.method]} ${p.amount < 0 ? "refund" : "payment"}`;
}
