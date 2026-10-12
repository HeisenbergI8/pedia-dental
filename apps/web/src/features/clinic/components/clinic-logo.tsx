"use client";
/* eslint-disable @next/next/no-img-element -- the logo comes from the API or public/demo, not a build-time asset */
import { useState } from "react";
import { PageLoading } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useClinic } from "../api";

/**
 * The clinic's logo, wherever Primolar's used to be (decision #31): sidebar, portal, receipts, letterheads. With no
 * logo, the clinic's name in its heading font. In dark mode the image sits on a small white plate: logos are drawn for
 * white paper, and recolouring someone's logo is not ours to do. `alt` is the clinic's name.
 */
export function ClinicLogo({ className }: { className?: string }) {
  const clinic = useClinic().data;
  const [broken, setBroken] = useState<string>(); // the URL that failed: a new upload gets a new URL and tries again
  if (!clinic) return <Skeleton className={cn("h-8 w-32", className)} />;
  const { account, logoUrl } = clinic;
  if (!logoUrl || broken === logoUrl) return <span className={cn("block font-title text-lg leading-tight font-semibold text-ink", className)}>{account.name}</span>;
  return (
    <span className={cn("inline-flex dark:rounded-md dark:bg-paper dark:p-1.5", className)}>
      <img src={logoUrl} alt={account.name} onError={() => setBroken(logoUrl)} className="h-auto max-h-14 w-full object-contain object-left" />
    </span>
  );
}

/** Logos this session has measured: fits a square (true) or too wide to read in one (false). Shared by every mount. */
const SQUARE_ENOUGH = new Map<string, boolean>();
const MAX_RATIO = 1.5; // wider than this, a 48 px square shrinks a wordmark to an unreadable sliver

/**
 * The tablet rail's square and the page loader: the logo when it is squarish, else the name's first letter on the
 * brand's deep colour. Most clinic logos are wide wordmarks, which only the sidebar has room for.
 */
export function ClinicMark({ className }: { className?: string }) {
  const clinic = useClinic().data;
  const [, measured] = useState(0);
  if (!clinic) return <Skeleton className={cn("size-12 rounded-lg", className)} />;
  const { account, logoUrl } = clinic;
  const fits = logoUrl ? SQUARE_ENOUGH.get(logoUrl) : false;
  if (logoUrl && fits) {
    return (
      <span className={cn("flex size-12 items-center justify-center rounded-lg bg-paper p-1", className)}>
        <img src={logoUrl} alt={account.name} className="max-h-full max-w-full object-contain" />
      </span>
    );
  }
  return (
    <span aria-label={account.name} className={cn("flex size-12 items-center justify-center rounded-lg bg-brand-deep font-title text-xl font-semibold text-on-deep", className)}>
      {account.name.charAt(0)}
      {logoUrl && fits === undefined && (
        <img
          src={logoUrl}
          alt=""
          hidden
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            SQUARE_ENOUGH.set(logoUrl, !!w && !!h && w / h <= MAX_RATIO);
            measured((n) => n + 1);
          }}
          onError={() => SQUARE_ENOUGH.set(logoUrl, false)}
        />
      )}
    </span>
  );
}

/** The in-app page loader with the clinic's mark, gently bobbing (decision #52). Primolar's stays on cold start only. */
export function ClinicPageLoading({ label }: { label?: string }) {
  return <PageLoading label={label} mark={<ClinicMark className="pm-bob size-14" />} />;
}
