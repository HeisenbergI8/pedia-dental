"use client";
import { useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { InboxIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ConfirmReceiptInput, RejectReceiptInput, UpfrontMethod, formatPeso, type ReceiptToCheck } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { METHOD_LABEL } from "@/features/billing/api";
import { receiptImageUrl, useConfirmReceipt, useReceiptsToCheck, useRejectReceipt } from "../api";

const forWhat = (r: ReceiptToCheck) => (r.periodStart ? `The month from ${format(parseISO(r.periodStart), "d MMMM yyyy")}` : "Setup fee and first month");
/** The day it was sent, in Manila: the default "paid on". */
const manilaDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** B12 decision 8: every receipt waiting for Primolar, oldest first. Confirm records the payment; reject sends the reason. */
export function PaymentsScreen() {
  const receipts = useReceiptsToCheck();
  const [open, setOpen] = useState<{ kind: "confirm" | "reject"; receipt: ReceiptToCheck }>();
  const opener = useRef<HTMLElement | null>(null);
  const show = (kind: "confirm" | "reject", receipt: ReceiptToCheck) => ((opener.current = document.activeElement as HTMLElement | null), setOpen({ kind, receipt }));
  const returnFocus = (e: Event) => {
    e.preventDefault();
    (opener.current?.isConnected ? opener.current : document.getElementById("main"))?.focus();
  };
  const close = () => setOpen(undefined);

  return (
    <div className="space-y-5">
      <PageHeader title="Payments to check" description="Receipts clinics sent after paying by QR. Confirm only what the receipt shows was paid in full." />
      {receipts.isLoading && <Loading label="Loading payments to check" />}
      {receipts.error && <ErrorState what="the payments to check" onRetry={() => void receipts.refetch()} />}
      {receipts.data?.length === 0 && <EmptyState icon={InboxIcon} title="No payments to check">New receipts show here as clinics send them.</EmptyState>}
      {!!receipts.data?.length && (
        <ul className="space-y-3">
          {receipts.data.map((r) => (
            <li key={r.id} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:flex-row">
              <a href={receiptImageUrl(r.id)} target="_blank" rel="noreferrer" className="shrink-0 self-start rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
                <img src={receiptImageUrl(r.id)} alt={`Receipt ${r.reference} from ${r.payer.clinicName}`} className="size-28 rounded-md border border-line object-cover" />
                <span className="sr-only"> (opens full size in a new tab)</span>
              </a>
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="text-base font-semibold">
                  {r.payer.kind === "signup" ? (
                    <Link href={`/operator/signups/${r.payer.signupId}`} className="underline-offset-2 hover:underline">{r.payer.clinicName}</Link>
                  ) : (
                    <Link href={`/operator/accounts/${r.payer.clinicId}`} className="underline-offset-2 hover:underline">{r.payer.clinicName}</Link>
                  )}
                  {r.payer.kind === "signup" && <span className="font-normal text-ink-muted"> · sign-up {r.payer.signupReference}</span>}
                </p>
                <p>{forWhat(r)} · <span className="font-semibold tabular-nums">{formatPeso(r.amountDue)}</span> due</p>
                <p className="text-ink-muted">
                  Ref <span className="font-mono text-ink">{r.reference}</span> · sent {format(parseISO(r.uploadedAt), "d MMM yyyy, h:mm a")}
                </p>
              </div>
              <div className="flex gap-2 self-start">
                <Button onClick={() => show("confirm", r)}>Confirm</Button>
                <Button variant="outline" onClick={() => show("reject", r)}>Reject</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open?.kind === "confirm" && <ConfirmDialog r={open.receipt} onClose={close} returnFocus={returnFocus} />}
      {open?.kind === "reject" && <RejectDialog r={open.receipt} onClose={close} returnFocus={returnFocus} />}
    </div>
  );
}

type DialogProps = { r: ReceiptToCheck; onClose: () => void; returnFocus: (e: Event) => void };

/** Decision 22: always the full amount due; GCash by default, the day it was sent. */
function ConfirmDialog({ r, onClose, returnFocus }: DialogProps) {
  const confirm = useConfirmReceipt(r.id);
  const form = useForm<ConfirmReceiptInput>({ resolver: zodResolver(ConfirmReceiptInput), defaultValues: { method: "gcash", paidOn: manilaDay(r.uploadedAt) } });
  const submit = form.handleSubmit((input) => confirm.mutate(input, { onSuccess: () => { toast.success(`Payment from ${r.payer.clinicName} confirmed`); onClose(); } }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Confirm {r.payer.clinicName}&apos;s payment</DialogTitle>
          <DialogDescription>Confirm only if the receipt shows the full {formatPeso(r.amountDue)}. Otherwise reject it and say why.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField name="method" label="Paid by">
              {(props) => (
                <Controller
                  control={form.control}
                  name="method"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UpfrontMethod.options.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField name="paidOn" label="Paid on">
              <Input type="date" className="sm:w-56" {...form.register("paidOn")} />
            </FormField>
            {confirm.error && <p role="alert" className="text-sm text-danger">{confirm.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={confirm.isPending}>{confirm.isPending ? "Confirming" : `Confirm ${formatPeso(r.amountDue)}`}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Decisions 6, 22: the clinic reads the reason and can send a new receipt. */
function RejectDialog({ r, onClose, returnFocus }: DialogProps) {
  const reject = useRejectReceipt(r.id);
  const form = useForm<RejectReceiptInput>({ resolver: zodResolver(RejectReceiptInput), defaultValues: { reason: "" } });
  const submit = form.handleSubmit(({ reason }) => reject.mutate(reason, { onSuccess: () => { toast.success("Receipt rejected"); onClose(); } }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Reject receipt {r.reference}?</DialogTitle>
          <DialogDescription>{r.payer.clinicName} sees your reason and can send a new receipt.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField name="reason" label="Reason for the clinic">
              <Textarea rows={3} {...form.register("reason")} />
            </FormField>
            {reject.error && <p role="alert" className="text-sm text-danger">{reject.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Keep it</Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>{reject.isPending ? "Rejecting" : "Reject receipt"}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
