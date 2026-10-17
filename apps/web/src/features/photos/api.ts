"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ClinicalPhoto, type UploadPhotoInput, isPdf } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { compressImage } from "@/lib/image";

export const photoKeys = {
  forPatient: (patientId: string) => ["photos", "patient", patientId] as const,
};

/**
 * Usable directly as an <img> src or a link. The API answers with a 302 to a 5-minute private link (B10), which <img> and
 * <a> follow by themselves. `download`: saved rather than opened, because a browser ignores <a download> once a redirect
 * leaves the page's origin.
 */
export const photoFileUrl = (photoId: string, { download = false } = {}) => `${env.apiUrl}/photos/${photoId}/file${download ? "?download=1" : ""}`;

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
      // A PDF goes as it is; photos are shrunk in the browser first (the mock stores them in IndexedDB).
      if (isPdf(file.type)) body.set("file", file, file.name);
      else body.set("file", await compressImage(file), "photo.jpg");
      body.set("meta", JSON.stringify(meta));
      return api(`/patients/${patientId}/photos`, ClinicalPhoto, { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: photoKeys.forPatient(patientId) }),
  });
}
