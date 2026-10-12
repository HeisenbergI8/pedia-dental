"use client";
import { PauseCircleIcon } from "lucide-react";
import { useSession } from "@/features/auth/access";

/** A parent of a suspended clinic can read everything but change nothing (decisions #44, #46). Says why the buttons are gone. */
export function PausedNotice() {
  if (!useSession()?.user.readOnly) return null;
  return (
    <p role="status" className="flex gap-2.5 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-warning">
      <PauseCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <strong className="font-semibold">Your clinic&apos;s account is paused.</strong> You can still see your child&apos;s records and
        receipts. To book, confirm or send anything, contact your clinic.
      </span>
    </p>
  );
}
