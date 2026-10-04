"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ClinicalPhoto, type UploadPhotoInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { compressImage } from "@/lib/image";

export const photoKeys = {
  forPatient: (patientId: string) => ["photos", "patient", patientId] as const,
};

/** Usable directly as an <img> src. */
export const photoFileUrl = (photoId: string) => `${env.apiUrl}/photos/${photoId}/file`;

/** Newest first. */
export function usePhotos(patientId: string) {
  return useQuery({
    queryKey: photoKeys.forPatient(patientId),
    queryFn: () => api(`/patients/${patientId}/photos`, z.array(ClinicalPhoto)),
  });
}

export function useUploadPhoto(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, ...meta }: UploadPhotoInput & { file: File }) => {
      const body = new FormData();
      body.set("file", await compressImage(file), "photo.jpg");
      body.set("meta", JSON.stringify(meta));
      return api(`/patients/${patientId}/photos`, ClinicalPhoto, { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: photoKeys.forPatient(patientId) }),
  });
}
