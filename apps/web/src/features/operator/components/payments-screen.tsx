"use client";
import { useRef, useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { InboxIcon, ZoomInIcon } from "lucide-react";
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

const forWhat = (r: ReceiptToCheck) =>
  r.payer.kind === "text_topup"
    ? `Text top-up, ${r.packs} pack${r.packs === 1 ? "" : "s"} (${(r.parts ?? 0).toLocaleString("en-PH")} texts)`
    : r.periodStart
      ? `The month from ${format(parseISO(r.periodStart), "d MMMM yyyy")}`
      : "Setup fee and first month";
const KIND_LABEL: Record<ReceiptToCheck["payer"]["kind"], string> = { signup: "New sign-up", subscription: "Monthly plan", text_topup: "Text top-up" };

/** The receipt large enough to read on the card; a tap opens it full size here, not in a new tab. */
function ReceiptImage({ r, onZoom }: { r: ReceiptToCheck; onZoom: () => void }) {
  return (
    <button
      type="button"
      onClick={onZoom}
      className="group relative flex h-72 items-center justify-center overflow-hidden rounded-xl border border-line bg-ground md:h-96"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
      <img src={receiptImageUrl(r.id)} alt={`Receipt ${r.reference} from ${r.payer.clinicName}`} className="h-full w-full object-contain" />
      <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-surface/90 px-2 py-1 text-xs font-semibold shadow-card">
        <ZoomInIcon aria-hidden className="size-3.5" /> View full size
      </span>
    </button>
  );
}

function ZoomDialog({ r, onClose, returnFocus }: DialogProps) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl" onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Receipt {r.reference}</DialogTitle>
          <DialogDescription>
            {r.payer.clinicName} · {formatPeso(r.amountDue)} due
          </DialogDescription>
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the API */}
        <img src={receiptImageUrl(r.id)} alt={`Receipt ${r.reference} from ${r.payer.clinicName}, full size`} className="mx-auto max-h-[70vh] w-auto rounded-lg" />
        <a href={receiptImageUrl(r.id)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand underline-offset-2 hover:underline">
          Open in a new tab
        </a>
      </DialogContent>
    </Dialog>
  );
}

/** The day it was sent, in Manila: the default "paid on". */
const manilaDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** B12 decision 8: every receipt waiting for Primolar, text top-ups first (D14), then oldest first. Confirm records the payment; reject sends the reason. */
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
  const [zoom, setZoom] = useState<ReceiptToCheck>();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments to check"
        description={
          receipts.data?.length
            ? `${receipts.data.length} waiting. Match each receipt with your GCash or bank app, then confirm or reject it.`
            : "Receipts clinics send after paying by QR show here."
        }
      />
      {receipts.isLoading && <Loading label="Loading payments to check" />}
      {receipts.error && <ErrorState what="the payments to check" onRetry={() => void receipts.refetch()} />}
      {receipts.data?.length === 0 && <EmptyState icon={InboxIcon} title="No payments to check">New receipts show here as clinics send them.</EmptyState>}
      {!!receipts.data?.length && (
        <ul className="space-y-4">
          {receipts.data.map((r) => (
            <li key={r.id} className="grid gap-5 rounded-2xl border border-line bg-surface p-4 sm:p-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
              <ReceiptImage r={r} onZoom={() => ((opener.current = document.activeElement as HTMLElement | null), setZoom(r))} />
              <div className="flex min-w-0 flex-col gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-ink-muted">{KIND_LABEL[r.payer.kind]}</p>
                  <h2 className="text-lg font-semibold wrap-anywhere">
                    {r.payer.kind === "signup" ? (
                      <Link href={`/operator/signups/${r.payer.signupId}`} className="underline-offset-2 hover:underline">{r.payer.clinicName}</Link>
                    ) : (
                      <Link href={`/operator/accounts/${r.payer.clinicId}`} className="underline-offset-2 hover:underline">{r.payer.clinicName}</Link>
                    )}
                    {r.payer.kind === "signup" && <span className="font-normal text-ink-muted"> · sign-up {r.payer.signupReference}</span>}
                  </h2>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-muted">Amount due</dt>
                  <dd className="text-xl font-semibold tabular-nums">{formatPeso(r.amountDue)}</dd>
                  <dt className="text-ink-muted">For</dt>
                  <dd>{forWhat(r)}</dd>
                  <dt className="text-ink-muted">Their reference</dt>
                  <dd className="font-mono wrap-anywhere">{r.reference}</dd>
                  <dt className="text-ink-muted">Sent</dt>
                  <dd>{format(parseISO(r.uploadedAt), "d MMM yyyy, h:mm a")}</dd>
                </dl>
                <div className="rounded-xl bg-ground p-3 text-sm">
                  <p className="font-semibold">Check in your GCash or bank app first</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-muted">
                    <li>The money arrived, for the full {formatPeso(r.amountDue)}</li>
                    <li>The reference {r.reference} matches the transaction</li>
                    <li>The date and the receiving account are Primolar&apos;s</li>
                  </ul>
                </div>
                <div className="mt-auto flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
                  <Button onClick={() => show("confirm", r)}>Confirm</Button>
                  <Button variant="outline" onClick={() => show("reject", r)}>Reject</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open?.kind === "confirm" && <ConfirmDialog r={open.receipt} onClose={close} returnFocus={returnFocus} />}
      {open?.kind === "reject" && <RejectDialog r={open.receipt} onClose={close} returnFocus={returnFocus} />}
      {zoom && <ZoomDialog r={zoom} onClose={() => setZoom(undefined)} returnFocus={returnFocus} />}
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

/** The usual reasons, one tap each; the first sentence is the button, the whole text goes to the clinic. */
const QUICK_REASONS = [
  "The amount is short. Please pay the rest and send a new receipt.",
  "We can't find this payment. Please check the reference number and send a new receipt.",
  "The screenshot is unclear. Please send a clearer one that shows the amount and reference.",
];

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
            <div className="flex flex-wrap gap-2" role="group" aria-label="Common reasons">
              {QUICK_REASONS.map((q) => (
                <Button key={q} type="button" variant="outline" size="sm" onClick={() => form.setValue("reason", q, { shouldValidate: true })}>
                  {q.split(".")[0]}
                </Button>
              ))}
            </div>
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
