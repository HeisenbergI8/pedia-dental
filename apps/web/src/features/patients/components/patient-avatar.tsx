"use client";
// Plain <img>: next/image optimises on the server, which can't reach files that live in the browser (mock)
// or behind the API's auth (later). Same reason as photos-tab.tsx:2–4.
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Patient } from "@pedia/shared";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { patientPhotoUrl } from "../api";

/** The child's photo, or their initials when there is none or it can't load (e.g. browser storage was cleared). */
export function PatientAvatar({
  patient,
  className,
}: {
  patient: Pick<Patient, "id" | "firstName" | "lastName" | "photoUpdatedAt">;
  className?: string;
}) {
  const src = patientPhotoUrl(patient);
  const [failed, setFailed] = useState<string>();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-base font-semibold text-brand-ink",
        className,
      )}
    >
      {src && failed !== src ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : (
        initials(patient.firstName, patient.lastName)
      )}
    </span>
  );
}
