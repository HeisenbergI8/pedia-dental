"use client";
import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { WalletIcon } from "lucide-react";
import { PaymentMethod, formatPeso } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatients } from "@/features/patients/api";
import { formatDate } from "@/lib/format";
import { METHOD_LABEL, useDailyPayments } from "../api";

/** Payments and refunds received on one day, with the day's total per method. */
export function CollectionsList() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const { data: rows = [], isLoading, error } = useDailyPayments(date);
  const patients = usePatients().data ?? [];
  const total = rows.reduce((s, p) => s + p.amount, 0);
  const byMethod = PaymentMethod.options
    .map((m) => [m, rows.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0)] as const)
    .filter(([, sum]) => sum !== 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        description="Payments and refunds received in a day. Invoices and payments are recorded on each patient's Billing tab."
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="collections-date">Day</Label>
            <Input id="collections-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
          </div>
        }
      />
      {isLoading ? (
        <p className="text-ink-muted">Loading collections…</p>
      ) : error ? (
        <p className="text-danger">Couldn&apos;t load collections. Refresh to try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={WalletIcon} title={`Nothing collected on ${formatDate(date)}`} />
      ) : (
        <SectionCard title={`Collected ${formatPeso(total)}`} description={byMethod.map(([m, sum]) => `${METHOD_LABEL[m]} ${formatPeso(sum)}`).join(" · ")}>
          <ul className="divide-y divide-line text-sm">
            {rows.map((p) => {
              const patient = patients.find((x) => x.id === p.patientId);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className="text-ink-muted tabular-nums">{format(parseISO(p.receivedAt), "h:mm a")}</span>
                  <Link href={`/patients/${p.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
                    {patient ? `${patient.lastName}, ${patient.firstName}` : "Patient"}
                  </Link>
                  <span>
                    {p.amount < 0 ? "Refund · " : ""}{METHOD_LABEL[p.method]}
                    {p.referenceNo && ` · ref ${p.referenceNo}`}
                  </span>
                  <span className="ml-auto tabular-nums">{formatPeso(p.amount)}</span>
                  <Link href={`/patients/${p.patientId}/receipts/${p.id}`} className="text-brand underline">{p.receiptNo}</Link>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
