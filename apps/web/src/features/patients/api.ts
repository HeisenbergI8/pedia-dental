"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { AddConsentInput, CreatePatientInput, Patient } from "@pedia/shared";
import { api } from "@/lib/api-client";

export const patientKeys = {
  all: ["patients"] as const,
  list: (q: string) => [...patientKeys.all, "list", q] as const,
  detail: (id: string) => [...patientKeys.all, "detail", id] as const,
};

export function usePatients(search = "") {
  return useQuery({
    queryKey: patientKeys.list(search),
    queryFn: () => api(`/patients?q=${encodeURIComponent(search)}`, z.array(Patient)),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: () => api(`/patients/${id}`, Patient),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePatientInput) =>
      api("/patients", Patient, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePatientInput) =>
      api(`/patients/${id}`, Patient, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useAddConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddConsentInput) =>
      api(`/patients/${patientId}/consents`, Patient, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (patient) => qc.setQueryData(patientKeys.detail(patientId), patient),
  });
}
