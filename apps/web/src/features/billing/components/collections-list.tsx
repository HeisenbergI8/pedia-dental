"use client";
import { useState } from "react";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon, WalletIcon } from "lucide-react";
import { PaymentMethod, formatPeso, type Payment } from "@pedia/shared";
import { DataList, type DataColumn } from "@/components/data-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatients } from "@/features/patients/api";
import { formatDate } from "@/lib/format";
import { METHOD_LABEL, useDailyPayments } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

/** Payments and refunds received on one day, with the day's total per method. */
export function CollectionsList() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(today);
  const { data: rows = [], isLoading, error, refetch, isRefetching } = useDailyPayments(date);
  const patients = usePatients().data ?? [];
  const total = rows.reduce((s, p) => s + p.amount, 0);
  const step = (days: number) => setDate(format(addDays(parseISO(date), days), "yyyy-MM-dd"));
  const name = (id: string) => {
    const x = patients.find((p) => p.id === id);
    return x ? `${x.lastName}, ${x.firstName}` : "Patient";
  };
  // Phone card: patient and amount on top; time, method, reference and receipt below.
  const columns: DataColumn<Payment>[] = [
    { key: "time", header: "Time", mobile: "meta", numeric: false, className: "whitespace-nowrap tabular-nums text-ink-muted", cell: (p) => format(parseISO(p.receivedAt), "h:mm a") },
    {
      key: "patient",
      header: "Patient",
      mobile: "title",
      cell: (p) => (
        <Link href={`/patients/${p.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">
          {name(p.patientId)}
        </Link>
      ),
    },
    { key: "method", header: "Method", mobile: "meta", cell: (p) => (p.amount < 0 ? `${METHOD_LABEL[p.method]} refund` : METHOD_LABEL[p.method]) },
    { key: "reference", header: "Reference", mobile: "meta", className: "whitespace-nowrap tabular-nums", cell: (p) => (p.referenceNo ? `ref ${p.referenceNo}` : null) },
    {
      key: "receipt",
      header: "Receipt",
      mobile: "meta",
      cell: (p) => (
        <Link href={`/patients/${p.patientId}/receipts/${p.id}`} className="whitespace-nowrap text-brand underline underline-offset-2">
          {p.receiptNo}
        </Link>
      ),
    },
    { key: "amount", header: "Amount", mobile: "trailing", numeric: true, cell: (p) => <span className={p.amount < 0 ? "text-danger" : "font-medium"}>{formatPeso(p.amount)}</span> },
  ];
  const byMethod = PaymentMethod.options
    .map((m) => [m, rows.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0)] as const)
    .filter(([, sum]) => sum !== 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Billing"
        description="Payments and refunds received in a day. Invoices and payments are recorded on each patient's Billing tab."
        actions={
          // The same day stepper as Appointments: Today, back and forward a day, or pick one.
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDate(today)} disabled={date === today}>Today</Button>
            <Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => step(-1)}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next day" onClick={() => step(1)} disabled={date >= today}>
              <ChevronRightIcon />
            </Button>
            <Label htmlFor="collections-date" className="sr-only">Day</Label>
            <Input id="collections-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
          </div>
        }
      />
      {isLoading ? (
        <Loading label="Loading collections" />
      ) : error ? (
        <ErrorState what="the collections" onRetry={() => refetch()} retrying={isRefetching} />
      ) : rows.length === 0 ? (
        <EmptyState icon={WalletIcon} title={`Nothing collected on ${formatDate(date)}`} />
      ) : (
        <SectionCard title={`Collected ${formatPeso(total)}`}>
          {/* The day's split by method, as a list: one method per row, amounts lined up to compare. */}
          <dl className="mb-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 border-b border-line pb-4 text-sm sm:max-w-sm">
            {byMethod.map(([m, sum]) => (
              <div key={m} className="contents">
                <dt className="text-ink-muted">{METHOD_LABEL[m]}</dt>
                <dd className="text-right tabular-nums">{formatPeso(sum)}</dd>
              </div>
            ))}
          </dl>
          <DataList bare rows={rows} columns={columns} rowKey={(p) => p.id} caption={`Payments on ${formatDate(date)}`} />
        </SectionCard>
      )}
    </div>
  );
}
