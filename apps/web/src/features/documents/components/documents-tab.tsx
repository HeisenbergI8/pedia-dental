"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { FileTextIcon } from "lucide-react";
import { DENTIST_SIGNED, DOCUMENT_TYPE_LABEL, DocumentType, GenerateDocumentInput } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { cn } from "@/lib/utils";
import { useDocumentSources, usePatientDocuments } from "../api";
import { buildDocument, type DocContent, type DocSources } from "../content";
import { DocumentOptions, sourceOptions, type Draft } from "./document-options";
import { DocumentPreview } from "./document-preview";
import { DownloadDocumentButton } from "./download-document-button";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { MetaLine } from "@/components/meta-line";

const DESCRIPTION: Record<DocumentType, string> = {
  dental_certificate: "Proof of a visit, for school or work",
  treatment_plan: "Planned treatment with fees and progress",
  consent_form: "For the parent to sign before treatment",
  referral_letter: "To a specialist, with history and findings",
  clearance: "Asks the child's doctor to clear treatment",
  post_op_instructions: "Care at home after a treatment",
  prescription: "Medicines, never controlled (S2) drugs",
  receipt: "Acknowledgment receipt for a payment",
  patient_summary: "The whole record on one page",
};

/** Sensible defaults: the latest record to generate from, and the dentist who saw the child last. */
function initialDraft(type: DocumentType, src: DocSources): Draft {
  const dentist = src.visits[0]?.dentistId ?? src.staff.find((s) => s.role === "dentist")?.id ?? "";
  const desk = src.staff.find((s) => s.role === "front_desk")?.id ?? dentist;
  return {
    issuedBy: DENTIST_SIGNED.includes(type) ? dentist : desk,
    sourceId: sourceOptions(type, src)[0]?.value,
    details: {},
    items: type === "prescription" ? [{ drugId: "", sig: "", quantity: "" }] : [],
  };
}

function toInput(type: DocumentType, d: Draft) {
  return GenerateDocumentInput.safeParse({
    type,
    issuedBy: d.issuedBy,
    sourceId: d.sourceId,
    details: Object.keys(d.details).length ? d.details : undefined,
    items: type === "prescription" ? d.items : undefined,
  });
}

export function DocumentsTab({ patientId }: { patientId: string }) {
  const sources = useDocumentSources(patientId);
  const [type, setType] = useState<DocumentType>("dental_certificate");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  if (sources.error) return <ErrorState what="this patient's record" onRetry={() => sources.refetch()} retrying={sources.isRefetching} />;
  if (!sources.data) return <Loading label="Loading documents…" />;
  const src = sources.data;
  const current = draft ?? initialDraft(type, src);
  const parsed = toInput(type, current);
  const errors = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
  let preview: DocContent | undefined;
  try {
    preview = parsed.success ? buildDocument(parsed.data, src) : undefined;
  } catch {
    preview = undefined; // the chosen record vanished; the download button reports it
  }

  function pick(t: DocumentType) {
    setType(t);
    setDraft(initialDraft(t, src));
    setShowErrors(false);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[17rem_1fr]">
      <SectionCard title="Choose a document">
        <ul className="flex flex-col gap-0.5">
          {DocumentType.options.map((t) => (
            <li key={t}>
              <button
                type="button"
                onClick={() => pick(t)}
                aria-current={t === type ? "true" : undefined}
                className={cn(
                  "relative w-full rounded-lg px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  t === type ? "bg-brand-subtle text-brand" : "hover:bg-ground",
                )}
              >
                {/* A bar as well as colour, like the NAV, so the selection doesn't rely on hue alone. */}
                {t === type && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand" />}
                <span className="block text-sm font-medium">{DOCUMENT_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-ink-muted">{DESCRIPTION[t]}</span>
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="min-w-0 space-y-5">
        <SectionCard
          title={DOCUMENT_TYPE_LABEL[type]}
          description="Filled in from the record. Check the preview, then download."
          action={<DownloadDocumentButton patientId={patientId} choice={parsed.success ? parsed.data : undefined} onInvalid={() => setShowErrors(true)} />}
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(15rem,19rem)_1fr]">
            <DocumentOptions type={type} src={src} draft={current} errors={showErrors ? errors : {}} onChange={setDraft} />
            {preview ? (
              <DocumentPreview content={preview} />
            ) : (
              <p className="self-start rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
                Choose the options on the left to see the document.
              </p>
            )}
          </div>
        </SectionCard>
        <IssuedDocuments patientId={patientId} src={src} />
      </div>
    </div>
  );
}

/** Feature 13's log on the patient record. "Download again" rebuilds from today's record and logs a new issue. */
function IssuedDocuments({ patientId, src }: { patientId: string; src: DocSources }) {
  const { data: docs = [], isLoading } = usePatientDocuments(patientId);
  return (
    <SectionCard title="Issued documents">
      {isLoading ? (
        <Loading label="Loading…" compact />
      ) : docs.length === 0 ? (
        <EmptyState icon={FileTextIcon} title="No documents issued yet">Each document you download is listed here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{DOCUMENT_TYPE_LABEL[d.type]}</p>
                <MetaLine
                  items={[format(parseISO(d.createdAt), "MMM d, yyyy h:mm a"), src.staff.find((s) => s.id === d.issuedBy)?.fullName ?? "Staff"]}
                />
              </div>
              <DownloadDocumentButton
                patientId={patientId}
                variant="outline"
                label="Download again"
                ariaLabel={`Download again: ${DOCUMENT_TYPE_LABEL[d.type]}, ${format(parseISO(d.createdAt), "MMM d, yyyy h:mm a")}`}
                choice={{ type: d.type, issuedBy: d.issuedBy, sourceId: d.sourceId, details: d.details, items: d.items }}
              />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
