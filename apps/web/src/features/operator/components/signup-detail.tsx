"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronLeftIcon, InboxIcon } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  BRANDING_CHOICE_LABEL,
  DESIGN_STATUS_LABEL,
  HEADING_FONT_LABEL,
  RecordUpfrontPaymentInput,
  RejectSignupInput,
  SignupInput,
  TIER_LABEL,
  amountDue,
  brandColorProblem,
  formatPeso,
  type CreateAccountResult,
  type Signup,
} from "@pedia/shared";
import { Loading } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { METHOD_LABEL } from "@/features/billing/api";
import { AmountDueSummary, SignupFields, showDuplicate, type SignupFiles } from "@/features/signup/components/signup-fields";
import { signupFileUrl, useApproveSignup, useFixSignup, useOperatorPrices, useReceiptsToCheck, useRecordPayment, useRejectSignup, useSignups } from "../api";
import { OwnerPassword } from "./owner-password";
import { PaymentFields } from "./payment-fields";
import { SignupBadge } from "./signup-badge";

type Open = "payment" | "fix" | "reject" | undefined;

/** Billing #12–#15: one sign-up, what it asks for, and the operator's four actions. Never patient data (#25). */
export function SignupDetail({ id }: { id: string }) {
  const signups = useSignups();
  const [open, setOpen] = useState<Open>();
  const [created, setCreated] = useState<CreateAccountResult>();
  const approve = useApproveSignup(id);
  const receipt = useReceiptsToCheck().data?.find((r) => r.payer.kind === "signup" && r.payer.signupId === id);
  // The dialogs mount without a Radix trigger, so focus goes back by hand: to the button that opened them, or to the
  // page when that button is gone (WCAG 2.4.3).
  const opener = useRef<HTMLElement | null>(null);
  const openDialog = (kind: Open) => ((opener.current = document.activeElement as HTMLElement | null), setOpen(kind));
  const returnFocus = (e: Event) => {
    e.preventDefault();
    (opener.current?.isConnected ? opener.current : document.getElementById("main"))?.focus();
  };
  if (signups.isLoading) return <Loading label="Loading the sign-up" />;
  if (signups.error) return <ErrorState what="the sign-up" onRetry={() => void signups.refetch()} />;
  const s = signups.data?.find((x) => x.id === id);
  const waiting = s?.status === "waiting";

  return (
    <div className="space-y-5">
      <Link href="/operator/signups" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeftIcon className="size-4" aria-hidden /> Sign-ups
      </Link>
      {!s ? (
        <EmptyState icon={InboxIcon} title="No such sign-up">It may have been removed with Reset demo data.</EmptyState>
      ) : (
        <>
          <PageHeader
            title={s.account.name}
            description={`${s.reference} · ${s.source === "console" ? "Added in the console" : "From the Get started form"}`}
            actions={<SignupBadge signup={s} />}
          />
          {waiting && (
            <div className="flex flex-wrap gap-2">
              {!s.payment && <Button onClick={() => openDialog("payment")}>Record payment</Button>}
              <Button
                disabled={!s.payment || approve.isPending}
                aria-describedby={!s.payment ? "approve-hint" : undefined}
                onClick={() => approve.mutate(undefined, { onSuccess: setCreated, onError: (e) => toast.error(e.message) })}
              >
                {approve.isPending ? "Approving" : "Approve and create clinic"}
              </Button>
              <Button variant="outline" onClick={() => openDialog("fix")}>Fix details</Button>
              <Button variant="ghost" onClick={() => openDialog("reject")}>Reject</Button>
              {!s.payment && <p id="approve-hint" className="w-full text-sm text-ink-muted">Approve opens once the setup fee is recorded.</p>}
            </div>
          )}
          {s.approval && (
            <p className="text-sm">
              <Link href={`/operator/accounts/${s.approval.clinicId}`} className="font-semibold text-brand underline-offset-2 hover:underline">Open the clinic account</Link>
              {s.design && <> · {DESIGN_STATUS_LABEL[s.design.status]}</>}
            </p>
          )}
          {s.rejection && (
            <SectionCard title="Reason sent to the client" description={`The client sees this reason on their sign-up page.${s.payment ? " Refund the payment outside the app." : ""}`}>
              <p className="text-sm whitespace-pre-line">{s.rejection.reason}</p>
            </SectionCard>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <Details s={s} />
            <Look s={s} />
          </div>
          <SectionCard title="Payment">
            {receipt && (
              <p role="status" className="rounded-lg border border-info-line bg-info-bg px-4 py-3 text-sm">
                A payment receipt is waiting (ref <span className="font-mono">{receipt.reference}</span>).{" "}
                <Link href="/operator/payments" className="font-semibold underline underline-offset-2">Check it in Payments to check</Link>
              </p>
            )}
            <AmountDueSummary quote={s.quote} title={s.payment ? "Paid" : "Amount due"} />
            {s.payment && (
              <p className="text-sm">
                {formatPeso(s.payment.amount)} by {METHOD_LABEL[s.payment.method]} on {s.payment.paidOn}
                {s.payment.reference && <> · ref. <span className="font-mono">{s.payment.reference}</span></>}
              </p>
            )}
          </SectionCard>
          {open === "payment" && <PaymentDialog s={s} onClose={() => setOpen(undefined)} returnFocus={returnFocus} />}
          {open === "fix" && <FixDialog s={s} onClose={() => setOpen(undefined)} returnFocus={returnFocus} />}
          {open === "reject" && <RejectDialog s={s} onClose={() => setOpen(undefined)} returnFocus={returnFocus} />}
          {created && (
            <Dialog open>
              <DialogContent showCloseButton={false} onCloseAutoFocus={returnFocus}>
                <DialogHeader>
                  <DialogTitle>{created.overview.account.name} is on Primolar</DialogTitle>
                  <DialogDescription>Pass the Owner&apos;s sign-in on in person or by phone.</DialogDescription>
                </DialogHeader>
                <OwnerPassword result={created} onDone={() => setCreated(undefined)} />
              </DialogContent>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}

function Details({ s }: { s: Signup }) {
  const rows: [string, string][] = [
    ["Contact email", s.account.contactEmail],
    ["TIN", s.account.tin],
    ["Plan", TIER_LABEL[s.account.tier]],
    ["First branch", `${s.branch.name} · ${s.branch.address} · ${s.branch.phone}`],
    ["Owner", `${s.owner.fullName} · ${s.owner.email}${s.owner.role === "dentist" ? " · dentist" : ""}`],
  ];
  return (
    <SectionCard title="Clinic">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted">{k}</dt>
            <dd className="break-words">{v}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

/** The branding choice and its files. The colour is shown as its hex and a swatch: not any account's colour yet. */
function Look({ s }: { s: Signup }) {
  const b = s.branding;
  return (
    <SectionCard title="Look" description={BRANDING_CHOICE_LABEL[b.choice]}>
      {b.choice === "own" && (
        <div className="space-y-3 text-sm">
          {s.logoRef && (
            <div className="flex min-h-16 items-center rounded-lg border border-line bg-ground/60 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the operator's cookie */}
              <img src={signupFileUrl(s.id, s.logoRef)} alt={`${s.account.name}'s logo`} className="max-h-16 w-48 object-contain" />
            </div>
          )}
          <p className="flex items-center gap-2">
            <span aria-hidden className="size-4 rounded-sm border border-line" style={{ background: b.brandColor }} />
            <span className="font-mono">{b.brandColor}</span>
            {brandColorProblem(b.brandColor) && <span className="text-warning">· below AA</span>}
          </p>
          <p>Heading font: {b.headingFont ? HEADING_FONT_LABEL[b.headingFont] : "Primolar default"}</p>
        </div>
      )}
      {b.choice === "default" && <p className="text-sm text-ink-muted">Primolar&apos;s colours, the clinic&apos;s name in place of a logo.</p>}
      {b.choice === "designed" && (
        <div className="space-y-3 text-sm">
          <p className="whitespace-pre-line">{b.brief}</p>
          {s.referenceRefs.length > 0 && (
            <ul className="flex flex-wrap gap-3">
              {s.referenceRefs.map((key, i) => (
                <li key={key}>
                  <a href={signupFileUrl(s.id, key)} target="_blank" rel="noreferrer" className="block rounded-lg border border-line p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with the operator's cookie */}
                    <img src={signupFileUrl(s.id, key)} alt={`Reference image ${i + 1}`} className="h-24 w-32 object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/** A4: the quoted total, in one payment, marked by hand. */
type DialogProps = { s: Signup; onClose: () => void; returnFocus: (e: Event) => void };

function PaymentDialog({ s, onClose, returnFocus }: DialogProps) {
  const record = useRecordPayment(s.id);
  const form = useForm<RecordUpfrontPaymentInput>({ resolver: zodResolver(RecordUpfrontPaymentInput), defaultValues: { method: "bank_transfer", reference: "", paidOn: format(new Date(), "yyyy-MM-dd") } });
  const submit = form.handleSubmit((input) =>
    record.mutate({ ...input, reference: input.reference || undefined }, { onSuccess: () => { toast.success("Payment recorded"); onClose(); } }),
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>{formatPeso(s.quote.total)}: the setup fee, first month{s.quote.designAddOn ? " and design" : ""}, in one payment.</DialogDescription>
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

/** Billing #13: typos, a better logo, a plan change (re-quoted, A2). Only while waiting. */
function FixDialog({ s, onClose, returnFocus }: DialogProps) {
  const fix = useFixSignup(s.id);
  const prices = useOperatorPrices();
  const [files, setFiles] = useState<SignupFiles>({ references: [] });
  const { account, branch, owner, branding } = s;
  const form = useForm<SignupInput>({ resolver: zodResolver(SignupInput), defaultValues: { account, branch, owner, branding } });
  const submit = form.handleSubmit((input) =>
    fix.mutate(
      { input, logo: files.logo, references: files.references },
      {
        onSuccess: () => { toast.success("Sign-up updated"); onClose(); },
        // Billing #10: a duplicate name or email goes under its field; any other refusal shows below the form.
        onError: (e) => showDuplicate(e, form.setError),
      },
    ),
  );
  const fieldConflict = !!(form.formState.errors.account?.name || form.formState.errors.account?.contactEmail);
  const choice = form.watch("branding.choice");
  const tier = form.watch("account.tier");
  const requoted = prices.data && (tier !== s.account.tier || choice !== s.branding.choice) ? amountDue(prices.data, tier, choice) : undefined;
  // Billing #24: the recorded payment covers this plan and look, so changing either would approve the clinic underpaid.
  const locked = !!s.payment && !!requoted;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fix {s.account.name}</DialogTitle>
          <DialogDescription>Correct what the client sent. Leave a file unchosen to keep the one already sent.</DialogDescription>
        </DialogHeader>
        {prices.data ? (
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="space-y-6">
              <SignupFields prices={prices.data} files={files} onFilesChange={setFiles} hasStoredLogo={!!s.logoRef} />
              {requoted && !locked && <AmountDueSummary quote={requoted} title="New amount due" />}
              {locked && (
                <p role="alert" className="rounded-lg border border-warning-line bg-warning-bg p-3 text-sm text-warning">
                  The setup fee is already recorded for the {TIER_LABEL[s.account.tier]} plan and {BRANDING_CHOICE_LABEL[s.branding.choice]}. Keep them, or
                  reject the sign-up and ask the clinic to sign up again.
                </p>
              )}
              {fix.error && !fieldConflict && <p role="alert" className="text-sm text-danger">{fix.error.message}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={fix.isPending || locked}>{fix.isPending ? "Saving" : "Save changes"}</Button>
              </DialogFooter>
            </form>
          </FormProvider>
        ) : (
          <Loading compact label="Loading prices" />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Billing #13, #14: the reason goes to the client word for word. A paid sign-up is refunded outside the app. */
function RejectDialog({ s, onClose, returnFocus }: DialogProps) {
  const reject = useRejectSignup(s.id);
  const form = useForm<RejectSignupInput>({ resolver: zodResolver(RejectSignupInput), defaultValues: { reason: "" } });
  const submit = form.handleSubmit(({ reason }) => reject.mutate(reason, { onSuccess: () => { toast.success(`${s.account.name} rejected`); onClose(); } }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Reject {s.account.name}?</DialogTitle>
          <DialogDescription>
            The client sees your reason on their sign-up page.{s.payment ? " Refund their payment outside the app; the sign-up will read Rejected, refunded." : ""}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-4">
            <FormField name="reason" label="Reason for the client">
              <Textarea rows={4} {...form.register("reason")} />
            </FormField>
            {reject.error && <p role="alert" className="text-sm text-danger">{reject.error.message}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Keep it</Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>{reject.isPending ? "Rejecting" : "Reject sign-up"}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
