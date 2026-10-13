"use client";
import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import { TIER_LABEL, BRANDING_CHOICE_LABEL, signupStatusLabel, type SignupStatusView } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { useSignupStatus } from "../api";
import { AmountDueSummary } from "./signup-fields";
import { SignupFrame } from "./signup-frame";

/** Billing #11, A1: the thank-you page, and the place a client later sees approval or the reason for a rejection. */
export function SignupStatusScreen({ reference }: { reference: string }) {
  const status = useSignupStatus(reference);
  const missing = status.error instanceof ApiError && status.error.status === 404;
  return (
    <SignupFrame>
      {status.isLoading && <Loading label="Finding your sign-up" />}
      {missing && (
        <EmptyState icon={SearchXIcon} title="We can't find that sign-up">
          Check the reference on your thank-you page, or <Link href="/get-started" className="font-semibold text-brand underline-offset-2 hover:underline">start a new sign-up</Link>.
        </EmptyState>
      )}
      {status.error && !missing && <ErrorState what="your sign-up" onRetry={() => void status.refetch()} />}
      {status.data && <Outcome view={status.data} />}
    </SignupFrame>
  );
}

const HEADLINE = (v: SignupStatusView) =>
  v.status === "approved"
    ? `${v.clinicName} is on Primolar`
    : v.status === "rejected"
      ? "Your sign-up wasn't approved"
      : v.paid
        ? "Payment received"
        : `Thank you. ${v.clinicName} is signed up`;

function Outcome({ view }: { view: SignupStatusView }) {
  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Badge variant="secondary">{signupStatusLabel(view)}</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">{HEADLINE(view)}</h1>
        {view.status === "waiting" && !view.paid && (
          <p className="text-ink-muted">Primolar will send you a payment link. Once it is paid and Primolar approves your sign-up, your clinic is set up.</p>
        )}
        {view.status === "waiting" && view.paid && <p className="text-ink-muted">Primolar is reviewing your sign-up. Check back here for the result.</p>}
        {view.status === "approved" && (
          <p className="text-ink-muted">
            Primolar gives your Owner a temporary password. They{" "}
            <Link href="/login" className="font-semibold text-brand underline-offset-2 hover:underline">sign in here</Link> and choose their own.
          </p>
        )}
      </header>

      {view.status === "rejected" && (
        <section aria-label="Why" className="space-y-2 rounded-lg border border-warning-line bg-warning-bg p-4 text-sm text-warning">
          <h2 className="font-semibold">Primolar&apos;s reason</h2>
          <p className="whitespace-pre-line">{view.rejectionReason}</p>
          {view.paid && <p>Your payment has been refunded.</p>}
          <p>Contact Primolar if you have questions.</p>
        </section>
      )}

      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4 text-sm">
        <p className="flex-1">
          Your reference: <span className="font-mono font-semibold">{view.reference}</span>
          <span className="block text-ink-muted">Keep it to check on your sign-up from the Get started page.</span>
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigator.clipboard.writeText(view.reference).then(() => toast.success("Reference copied"), () => toast.error("Couldn't copy. Select it and copy it instead."))}
        >
          Copy reference
        </Button>
      </section>

      <p className="text-sm text-ink-muted">
        {view.clinicName} · {TIER_LABEL[view.tier]} plan · {BRANDING_CHOICE_LABEL[view.branding]}
      </p>
      <AmountDueSummary quote={view.quote} title={view.paid ? "Paid" : "Amount due"} />
    </div>
  );
}
