"use client";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FileTextIcon } from "lucide-react";
import { DOCUMENT_TYPE_LABEL } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { useStaff } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { useDocumentLog } from "../api";
import { Loading } from "@/components/brand";

/** Every document issued across the clinic. Documents are created from a patient's Documents tab. */
export function DocumentLog() {
  const { data: docs = [], isLoading, error } = useDocumentLog();
  const patients = usePatients().data ?? [];
  const staff = useStaff().data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="Documents" description="Every certificate, prescription, receipt and letter issued, newest first. To create one, open the patient and choose Documents." />
      {isLoading ? (
        <Loading label="Loading documents…" />
      ) : error ? (
        <p className="text-danger">Couldn&apos;t load documents. Refresh to try again.</p>
      ) : docs.length === 0 ? (
        <EmptyState icon={FileTextIcon} title="No documents issued yet">Open a patient and choose the Documents tab to create one.</EmptyState>
      ) : (
        <SectionCard>
          <ul className="divide-y divide-line text-sm">
            {docs.map((d) => {
              const p = patients.find((x) => x.id === d.patientId);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="text-ink-muted tabular-nums">{format(parseISO(d.createdAt), "MMM d, h:mm a")}</span>
                  <span className="font-medium">{DOCUMENT_TYPE_LABEL[d.type]}</span>
                  <Link href={`/patients/${d.patientId}`} className="text-brand underline-offset-2 hover:underline">
                    {p ? `${p.lastName}, ${p.firstName}` : "Patient"}
                  </Link>
                  <span className="ml-auto text-ink-muted">{staff.find((s) => s.id === d.issuedBy)?.fullName ?? "Staff"}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
