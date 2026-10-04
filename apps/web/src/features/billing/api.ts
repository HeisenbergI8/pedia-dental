"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Invoice, Payment, type CreateInvoiceInput, type PaymentMethod, type RecordPaymentInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { patientKeys } from "@/features/patients/api";

export const billingKeys = {
  all: ["billing"] as const,
  invoices: (patientId: string) => [...billingKeys.all, "invoices", patientId] as const,
  payments: (patientId: string) => [...billingKeys.all, "payments", patientId] as const,
  day: (date: string) => [...billingKeys.all, "day", date] as const,
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  gcash: "GCash",
  maya: "Maya",
  card: "Card",
  bank_transfer: "Bank transfer",
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
export function useDailyPayments(date: string) {
  return useQuery({ queryKey: billingKeys.day(date), queryFn: () => api(`/payments?date=${date}`, z.array(Payment)) });
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
