"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignupInput, amountDue, brandColorProblem } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrices, useSubmitSignup } from "../api";
import { AmountDueSummary, SignupFields, emptySignup, showDuplicate, type SignupFiles } from "./signup-fields";
import { SignupFrame } from "./signup-frame";

/** Billing #4–#11: the public form. No sign-in; the clinic exists only once Primolar approves it (#12). */
export function GetStartedScreen() {
  const router = useRouter();
  const prices = usePrices();
  const send = useSubmitSignup();
  const [files, setFiles] = useState<SignupFiles>({ references: [] });
  const [logoError, setLogoError] = useState<string>();
  const form = useForm<SignupInput>({ resolver: zodResolver(SignupInput), defaultValues: emptySignup() });
  const [tier, choice] = useWatch({ control: form.control, name: ["account.tier", "branding.choice"] });

  const submit = form.handleSubmit((input) => {
    if (input.branding.choice === "own") {
      if (!files.logo) return setLogoError("Add your logo, or choose Use the default look");
      if (brandColorProblem(input.branding.brandColor)) return; // the colour field already says why, with a fix
    }
    setLogoError(undefined);
    send.mutate(
      { input, logo: files.logo, references: files.references },
      {
        onSuccess: (view) => router.push(`/get-started/${view.reference}`),
        onError: (e) => showDuplicate(e, form.setError),
      },
    );
  });

  const fieldConflict = !!(form.formState.errors.account?.name || form.formState.errors.account?.contactEmail);

  return (
    <SignupFrame>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Get started with Primolar</h1>
        <p className="text-ink-muted">
          Tell us about your clinic. Once your payment arrives and Primolar approves your sign-up, your clinic is ready, in
          your own look, and your Owner signs in.
        </p>
      </header>
      {prices.isLoading && <Loading label="Loading plans and prices" />}
      {prices.error && <ErrorState what="the plans and prices" onRetry={() => void prices.refetch()} />}
      {prices.data && (
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate className="space-y-6">
            <SectionCard title="Sign up">
              <SignupFields prices={prices.data} files={files} onFilesChange={setFiles} logoError={logoError} />
            </SectionCard>
            <AmountDueSummary quote={amountDue(prices.data, tier, choice)} />
            <p className="text-sm text-ink-muted">
              Paid once, upfront: the setup fee and your first month{choice === "designed" ? ", and the design" : ""}. Primolar
              will send you a payment link.
            </p>
            {send.error && !fieldConflict && (
              <p role="alert" className="text-sm text-danger">{send.error.message}</p>
            )}
            <Button type="submit" size="lg" disabled={send.isPending}>
              {send.isPending ? "Sending" : "Send sign-up"}
            </Button>
          </form>
        </FormProvider>
      )}
      <CheckSignup />
    </SignupFrame>
  );
}

/** A1: how a client comes back to their sign-up, a rejection's reason included. */
function CheckSignup() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  return (
    <SectionCard title="Already signed up?" description="Enter the reference from your thank-you page to see where your sign-up is.">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (reference.trim()) router.push(`/get-started/${encodeURIComponent(reference.trim().toUpperCase())}`);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="check-reference">Reference</Label>
          <Input id="check-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PRM-XXXX-XXXX" autoComplete="off" spellCheck={false} className="w-48 font-mono uppercase" />
        </div>
        <Button type="submit" variant="outline">Check sign-up</Button>
      </form>
    </SectionCard>
  );
}
