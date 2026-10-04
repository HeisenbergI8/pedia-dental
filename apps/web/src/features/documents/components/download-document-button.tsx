"use client";
import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import type { GenerateDocumentInput } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { useDocumentSources, useGenerateDocument } from "../api";
import { buildDocument } from "../content";
import { downloadPdf } from "../download";

/**
 * Logs the document first (the server checks the issuer, the source record, S2 drugs and allergies), then
 * builds and saves the PDF. A refused document never becomes a file.
 */
export function DownloadDocumentButton({ patientId, choice, label = "Download PDF", ariaLabel, variant = "default", onInvalid }: {
  patientId: string;
  choice: GenerateDocumentInput | undefined; // undefined: the form isn't valid yet
  label?: string;
  /** Starts with `label` (WCAG 2.5.3); tells repeated buttons apart, e.g. in the issued list. */
  ariaLabel?: string;
  variant?: "default" | "outline";
  onInvalid?: () => void;
}) {
  const sources = useDocumentSources(patientId);
  const generate = useGenerateDocument(patientId);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!choice) return onInvalid?.();
    if (!sources.data) return;
    setBusy(true);
    try {
      const content = buildDocument(choice, sources.data); // throws before logging if the source is gone
      await generate.mutateAsync(choice);
      await downloadPdf(content);
      toast.success(`${content.title} downloaded and logged on the record`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the document");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} disabled={busy || sources.isLoading} onClick={run} aria-label={ariaLabel}>
      <DownloadIcon aria-hidden /> {busy ? "Preparing" : label}
    </Button>
  );
}
