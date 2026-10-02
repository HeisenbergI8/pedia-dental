"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ClinicalPhoto, type UploadPhotoInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";

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

/**
 * Downscales to at most 1600px on the long side and re-encodes as JPEG, so a
 * 4 MB phone photo is stored as roughly 200–400 KB.
 */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read this image"))), "image/jpeg", 0.82),
  );
}

export function useUploadPhoto(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, ...meta }: UploadPhotoInput & { file: File }) => {
      const body = new FormData();
      body.set("file", await compress(file), "photo.jpg");
      body.set("meta", JSON.stringify(meta));
      return api(`/patients/${patientId}/photos`, ClinicalPhoto, { method: "POST", body });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: photoKeys.forPatient(patientId) }),
  });
}
