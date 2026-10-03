"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PatientDocument, type GenerateDocumentInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { useInvoices, usePayments } from "@/features/billing/api";
import { useChartEntries } from "@/features/chart/api";
import { useProcedures, useStaff } from "@/features/clinic/api";
import { useMessageTemplates } from "@/features/messages/api";
import { useNoteTemplates, useNotes } from "@/features/notes/api";
import { usePatient } from "@/features/patients/api";
import { usePlan } from "@/features/plan/api";
import { useVisits } from "@/features/visits/api";
import type { DocSources } from "./content";

export const documentKeys = {
  all: ["documents"] as const,
  forPatient: (patientId: string) => [...documentKeys.all, "patient", patientId] as const,
};

/** Newest first. */
export function usePatientDocuments(patientId: string) {
  return useQuery({ queryKey: documentKeys.forPatient(patientId), queryFn: () => api(`/patients/${patientId}/documents`, z.array(PatientDocument)) });
}

/** Every document issued across the clinic, newest first. */
export function useDocumentLog() {
  return useQuery({ queryKey: documentKeys.all, queryFn: () => api("/documents", z.array(PatientDocument)) });
}

export function useGenerateDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateDocumentInput) => api(`/patients/${patientId}/documents`, PatientDocument, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentKeys.all }),
  });
}

/** One patient's record for documents, from the same (cached) queries the other tabs use. */
export function useDocumentSources(patientId: string): {
  data?: DocSources;
  isLoading: boolean;
  error: Error | null;
  /** Retries only the queries that failed. */
  refetch: () => void;
  isRefetching: boolean;
} {
  const patient = usePatient(patientId);
  const staff = useStaff();
  const procedures = useProcedures();
  const visits = useVisits(patientId);
  const notes = useNotes(patientId);
  const noteTemplates = useNoteTemplates();
  const chart = useChartEntries(patientId);
  const plan = usePlan(patientId);
  const invoices = useInvoices(patientId);
  const payments = usePayments(patientId);
  const messageTemplates = useMessageTemplates();
  const all = [patient, staff, procedures, visits, notes, noteTemplates, chart, plan, invoices, payments, messageTemplates];
  const error = all.find((q) => q.error)?.error ?? null;
  const refetch = () => all.filter((q) => q.error).forEach((q) => void q.refetch());
  const isRefetching = all.some((q) => q.isRefetching);
  if (!patient.data || !staff.data || !procedures.data || !visits.data || !notes.data || !noteTemplates.data || !chart.data || !plan.data || !invoices.data || !payments.data || !messageTemplates.data) {
    return { isLoading: !error, error, refetch, isRefetching };
  }
  return {
    data: {
      patient: patient.data,
      staff: staff.data,
      procedures: procedures.data,
      visits: visits.data,
      notes: notes.data,
      noteTemplates: noteTemplates.data,
      chart: chart.data,
      plan: plan.data,
      invoices: invoices.data,
      payments: payments.data,
      messageTemplates: messageTemplates.data,
    },
    isLoading: false,
    error: null,
    refetch,
    isRefetching,
  };
}
