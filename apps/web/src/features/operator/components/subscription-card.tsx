"use client";
import { useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  RecordUpfrontPaymentInput,
  SUBSCRIPTION_STATE_LABEL,
  TIER_LABEL,
  formatBillingDate,
  formatPeso,
  type AccountOverview,
  type SubscriptionView,
} from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentHistory } from "@/features/clinic/components/payment-history";
import { useAccountSubscription, useCancelSubscription, useRecordSubscriptionPayment } from "../api";
import { PaymentFields } from "./payment-fields";

type Open = "payment" | "cancel" | undefined;

/**
 * Billing #29–#31: the clinic's subscription as Primolar sees it: its state, the next due date and amount, a waiting
 * downgrade, why it is paused, every payment with its invoice, Record payment and Cancel subscription.
 */
export function SubscriptionCard({ row }: { row: AccountOverview }) {
  const sub = useAccountSubscription(row.account.id);
  const [open, setOpen] = useState<Open>();
  // The dialogs open from buttons that a cancel removes, so focus returns here by hand (WCAG 2.4.3).
  const payButton = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLDListElement>(null);
  if (sub.isLoading) return <Loading label="Loading the subscription" />;
  if (!sub.data) return <ErrorState what="the subscription" onRetry={() => void sub.refetch()} />;
  const s = sub.data;
  const close = () => setOpen(undefined);

  return (
    <SectionCard title="Subscription" description={SUBSCRIPTION_STATE_LABEL[s.state]}>
      <dl ref={summary} tabIndex={-1} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm outline-none">
        <dt className="text-ink-muted">{s.cancelledAt ? "Ends on" : "Next due"}</dt>
        <dd>
          {formatBillingDate(s.nextDue)}
          {s.state === "overdue" && <> · pay by {formatBillingDate(s.payBy)}</>}
        </dd>
        {!s.cancelledAt && (
          <>
            <dt className="text-ink-muted">Next payment</dt>
            <dd className="tabular-nums">
              {formatPeso(s.nextAmount)} <span className="text-ink-muted">({TIER_LABEL[s.nextTier]}, includes {formatPeso(s.nextVat)} VAT)</span>
            </dd>
          </>
        )}
        {s.downgrade && (
          <>
            <dt className="text-ink-muted">Plan change</dt>
            <dd>To {TIER_LABEL[s.downgrade.tier]} on {formatBillingDate(s.downgrade.on)}</dd>
          </>
        )}
        {s.pausedFor && (
          <>
            <dt className="text-ink-muted">Paused for</dt>
            <dd>{s.pausedFor === "overdue" ? "Non-payment. Recording the payment reactivates it." : "Cancellation"}</dd>
          </>
        )}
        {s.cancelledAt && (
          <>
            <dt className="text-ink-muted">Cancelled on</dt>
            <dd>{formatBillingDate(s.cancelledAt.slice(0, 10))}</dd>
          </>
        )}
      </dl>
      {!s.cancelledAt && (
        <div className="flex flex-wrap gap-2">
          <Button ref={payButton} onClick={() => setOpen("payment")}>Record payment</Button>
          <Button variant="outline" onClick={() => setOpen("cancel")}>Cancel subscription</Button>
        </div>
      )}
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Payment history</h3>
        <PaymentHistory subscription={s} />
      </div>
      {open === "payment" && <MonthPaymentDialog name={row.account.name} s={s} onClose={close} returnFocus={() => (payButton.current ?? summary.current)?.focus()} />}
      {open === "cancel" && <CancelDialog name={row.account.name} s={s} onClose={close} returnFocus={() => summary.current?.focus()} />}
    </SectionCard>
  );
}

/** S5: one month at the amount shown; the server sets it. The date paid never moves the schedule (billing #29). */
type DialogProps = { name: string; s: SubscriptionView; onClose: () => void; returnFocus: () => void };
const keepFocus = (returnFocus: () => void) => (e: Event) => (e.preventDefault(), returnFocus());

function MonthPaymentDialog({ name, s, onClose, returnFocus }: DialogProps) {
  const record = useRecordSubscriptionPayment(s.clinicId);
  const form = useForm<RecordUpfrontPaymentInput>({
    resolver: zodResolver(RecordUpfrontPaymentInput),
    defaultValues: { method: "bank_transfer", reference: "", paidOn: s.today }, // the server's day, so it follows the demo clock
  });
  const submit = form.handleSubmit((input) =>
    record.mutate(
      { ...input, reference: input.reference || undefined },
      {
        onSuccess: (after) => {
          toast.success(after.pausedFor ? "Payment recorded. The clinic is still behind, so it stays paused." : `Payment recorded for ${name}`);
          onClose();
        },
      },
    ),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={keepFocus(returnFocus)}>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {formatPeso(s.nextAmount)} for the month from {formatBillingDate(s.nextDue)}, {TIER_LABEL[s.nextTier]} plan. The next due
            date stays on {name}&apos;s schedule.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <PaymentFields />
            {record.error && <p role="alert" className="text-sm text-danger">{record.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={record.isPending}>{record.isPending ? "Recording" : "Record payment"}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

/** Billing #30, S7: says what happens before it happens. There is no undo in the prototype. */
function CancelDialog({ name, s, onClose, returnFocus }: DialogProps) {
  const cancel = useCancelSubscription(s.clinicId);
  const endsNow = s.daysUntilDue <= 0; // the paid month has already ended, so the pause is immediate
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={keepFocus(returnFocus)}>
        <DialogHeader>
          <DialogTitle>Cancel {name}&apos;s subscription?</DialogTitle>
          <DialogDescription>
            {endsNow
              ? `${name}'s paid month ended on ${formatBillingDate(s.nextDue)}, so it pauses now`
              : `${name} keeps working until ${formatBillingDate(s.nextDue)}, the end of its paid month. Then it pauses`}
            : staff can&apos;t sign in, and parents keep read-only access. Nothing is deleted. This can&apos;t be undone here.
          </DialogDescription>
        </DialogHeader>
        {cancel.error && <p role="alert" className="text-sm text-danger">{cancel.error.message}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Keep subscription</Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(undefined, { onSuccess: () => (toast.success(`${name}'s subscription is cancelled`), onClose()) })}
          >
            Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
