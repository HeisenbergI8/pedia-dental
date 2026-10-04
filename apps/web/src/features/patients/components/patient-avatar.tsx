"use client";
// Plain <img>: next/image optimises on the server, which can't reach files that live in the browser (mock)
// or behind the API's auth (later). Same reason as photos-tab.tsx:2–4.
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import type { Patient } from "@pedia/shared";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { patientPhotoUrl } from "../api";

/**
 * Initials tints: recognition only, by id so a child keeps their colour. Brand, teal and neutral: never a status
 * colour, so an avatar can't be misread as "balance due" or "recall" (DESIGN_SYSTEM §2).
 */
const TONES = ["bg-brand-subtle text-brand-tint-ink", "bg-second-bg text-second", "bg-selected text-ink-muted"] as const;
export const avatarTone = (id: string) => TONES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % TONES.length];

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
        "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-deep text-base font-bold text-on-deep",
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
