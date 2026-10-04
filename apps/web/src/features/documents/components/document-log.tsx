"use client";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { FileTextIcon } from "lucide-react";
import { DOCUMENT_TYPE_LABEL } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useStaff } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { useDocumentLog } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { DataList } from "@/components/data-list";

/** Every document issued across the clinic. Documents are created from a patient's Documents tab. */
export function DocumentLog() {
  const { data: docs = [], isLoading, error, refetch, isRefetching } = useDocumentLog();
  const patients = usePatients().data ?? [];
  const staff = useStaff().data ?? [];
  return (
    <div className="space-y-5">
      <PageHeader title="Documents" description="Every certificate, prescription, receipt and letter issued, newest first. To create one, open the patient and choose Documents." />
      {isLoading ? (
        <Loading label="Loading documents" />
      ) : error ? (
        <ErrorState what="the documents" onRetry={() => refetch()} retrying={isRefetching} />
      ) : docs.length === 0 ? (
        <EmptyState icon={FileTextIcon} title="No documents issued yet">Open a patient and choose the Documents tab to create one.</EmptyState>
      ) : (
        <DataList
          caption="Documents issued, newest first"
          rows={docs}
          rowKey={(d) => d.id}
          columns={[
            { key: "type", header: "Document", mobile: "title", cell: (d) => <span className="font-medium">{DOCUMENT_TYPE_LABEL[d.type]}</span> },
            {
              key: "patient",
              header: "Patient",
              mobile: "meta",
              cell: (d) => {
                const p = patients.find((x) => x.id === d.patientId);
                return (
                  <Link href={`/patients/${d.patientId}`} className="text-brand underline-offset-2 hover:underline">
                    {p ? `${p.lastName}, ${p.firstName}` : "Patient"}
                  </Link>
                );
              },
            },
            { key: "issuedBy", header: "Issued by", mobile: "meta", cell: (d) => staff.find((s) => s.id === d.issuedBy)?.fullName ?? "Staff" },
            { key: "when", header: "Issued", mobile: "trailing", className: "whitespace-nowrap tabular-nums text-ink-muted", cell: (d) => format(parseISO(d.createdAt), "MMM d, h:mm a") },
          ]}
        />
      )}
    </div>
  );
}
