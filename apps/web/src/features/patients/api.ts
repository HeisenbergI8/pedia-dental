"use client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  AddConsentInput,
  CreatePatientInput,
  DuplicateMatch,
  PatientView,
  type EditPatientWithoutContactsInput,
  type Patient,
  PatientHeaderSummary,
  PatientPage,
  type ConsentScope,
  type PatientListQuery,
  type QuickUpdatePatientInput,
} from "@pedia/shared";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { compressImage } from "@/lib/image";

export const CONSENT_LABEL: Record<ConsentScope, string> = {
  general_treatment: "General treatment",
  local_anesthesia: "Local anesthesia",
  extraction: "Extraction",
  radiographs: "X-rays",
  clinical_photos: "Clinical photos",
  sedation: "Sedation",
  data_privacy: "Data privacy (RA 10173)",
};

export const patientKeys = {
  all: ["patients"] as const,
  list: (q: string) => [...patientKeys.all, "list", q] as const,
  page: (query: PatientListQuery) => [...patientKeys.all, "page", query] as const,
  detail: (id: string) => [...patientKeys.all, "detail", id] as const,
  summaries: ["patients", "summary"] as const,
  summary: (id: string) => [...patientKeys.summaries, id] as const,
};

export function usePatients(search = "") {
  return useQuery({
    queryKey: patientKeys.list(search),
    queryFn: () => api(`/patients?q=${encodeURIComponent(search)}`, z.array(PatientView)),
  });
}

/** One page of the patient list. Under `patientKeys.all`, so every patient mutation refreshes it. */
export function usePatientPage(query: PatientListQuery) {
  const qs = new URLSearchParams({ ...query, page: String(query.page), pageSize: String(query.pageSize) });
  return useQuery({
    queryKey: patientKeys.page(query),
    queryFn: () => api(`/patient-summaries?${qs}`, PatientPage),
    placeholderData: keepPreviousData, // the old page stays while the next loads: no skeleton flash on Next
    staleTime: 0, // balances change on /billing; coming back shows them without a refresh button
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: patientKeys.detail(id),
    queryFn: () => api(`/patients/${id}`, PatientView),
  });
}

/** Usable as an <img> src; undefined when the child has no photo (show initials). `v` refreshes it after a change. */
export const patientPhotoUrl = (p: Pick<Patient, "id" | "photoUpdatedAt">) =>
  p.photoUpdatedAt ? `${env.apiUrl}/patients/${p.id}/photo?v=${encodeURIComponent(p.photoUpdatedAt)}` : undefined;

/** Patient number, last visit, balance and credit for the pinned header. */
export function usePatientSummary(id: string) {
  return useQuery({
    queryKey: patientKeys.summary(id),
    queryFn: () => api(`/patients/${id}/summary`, PatientHeaderSummary),
    staleTime: 0, // a payment or a finished visit elsewhere shows on the next patient screen, no refresh button
  });
}

export function useQuickUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickUpdatePatientInput) => api(`/patients/${id}`, PatientView, { method: "PATCH", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

/** Asked once, on "Create patient": an action, so a mutation rather than a query that runs while typing. */
export function useCheckDuplicates() {
  return useMutation({
    // Only the three fields: the caller may pass the whole form.
    mutationFn: ({ firstName, lastName, birthDate }: Pick<CreatePatientInput, "firstName" | "lastName" | "birthDate">) =>
      api(`/patient-duplicates?${new URLSearchParams({ firstName, lastName, birthDate })}`, z.array(DuplicateMatch)),
  });
}

export function useSetPatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set("file", await compressImage(file, 512), "photo.jpg"); // a face at header size: 512 px is plenty
      return api(`/patients/${id}/photo`, PatientView, { method: "PUT", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useRemovePatientPhoto(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/patients/${id}/photo`, PatientView, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePatientInput) =>
      api("/patients", PatientView, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useUpdatePatient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    // The server picks the schema by permission: CreatePatientInput with patients.contact, otherwise
    // EditPatientWithoutContactsInput (stored contacts kept). The form validates the same one.
    mutationFn: (input: CreatePatientInput | EditPatientWithoutContactsInput) =>
      api(`/patients/${id}`, PatientView, { method: "PUT", body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: patientKeys.all }),
  });
}

export function useAddConsent(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddConsentInput) =>
      api(`/patients/${patientId}/consents`, PatientView, { method: "POST", body: JSON.stringify(input) }),
    onSuccess: (patient) => qc.setQueryData(patientKeys.detail(patientId), patient),
  });
}
