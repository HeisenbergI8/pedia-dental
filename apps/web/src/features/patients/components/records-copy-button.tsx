"use client";
import { DownloadIcon, LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRecordsCopy } from "../api";

/** B13c2a: the right of access and portability. Staff hand the file to a parent; a parent downloads their own child's. */
export function RecordsCopyButton({ patientId, label, className }: { patientId: string; label: string; className?: string }) {
  const copy = useRecordsCopy(patientId);
  const Icon = copy.isPending ? LoaderCircleIcon : DownloadIcon;
  return (
    <Button
      variant="outline"
      className={className}
      disabled={copy.isPending}
      aria-busy={copy.isPending}
      onClick={() => copy.mutate(undefined, { onSuccess: () => toast.success("Copy of records downloaded"), onError: (e) => toast.error(e.message) })}
    >
      <Icon aria-hidden className={cn(copy.isPending && "motion-safe:animate-spin")} />
      {label}
    </Button>
  );
}
