"use client";
import { format, parseISO } from "date-fns";
import { RECEIPT_STATUS_LABEL, formatPeso, type ReceiptView } from "@pedia/shared";

const forMonth = (periodStart: string | null) => (periodStart ? `Month from ${format(parseISO(periodStart), "d MMMM yyyy")}` : "Setup fee and first month");

/** B12 decisions 6, 24: receipts sent, newest first; each opens its image in a new tab. The status is words. */
export function ReceiptList({ receipts, imageUrl }: { receipts: ReceiptView[]; imageUrl: (id: string) => string }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {receipts.map((r) => (
        <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
          <span>{format(parseISO(r.uploadedAt), "d MMM yyyy")}</span>
          <span>{forMonth(r.periodStart)}</span>
          <span className="tabular-nums">{formatPeso(r.amountDue)}</span>
          <span className="font-mono text-ink-muted">ref {r.reference}</span>
          <span className="font-semibold">{RECEIPT_STATUS_LABEL[r.status]}</span>
          {r.status === "rejected" && <span className="basis-full text-ink-muted">{r.rejectionReason}</span>}
          <a href={imageUrl(r.id)} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-brand underline-offset-2 hover:underline">
            View<span className="sr-only"> receipt {r.reference}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
