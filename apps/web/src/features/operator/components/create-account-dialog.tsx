"use client";
import { useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CreateAccountInput, amountDue, brandColorProblem, type CreateAccountResult } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AmountDueSummary, SignupFields, emptySignup, showDuplicate, type SignupFiles } from "@/features/signup/components/signup-fields";
import { useCreateAccount, useOperatorPrices } from "../api";
import { OwnerPassword } from "./owner-password";
import { PaymentFields } from "./payment-fields";

/** A sign-up by phone or in person (billing #16): the public form's fields, plus the payment marked by hand. */
const empty = (): CreateAccountInput => ({ ...emptySignup(), payment: { method: "bank_transfer", reference: "", paidOn: format(new Date(), "yyyy-MM-dd") } });

/**
 * Billing #16: a clinic signed up by phone or in person, created at once: the same fields and branding choices as
 * Get started, and the upfront payment recorded by hand. The Owner's temporary password and PIN show once (#21).
 */
export function CreateAccountDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateAccount();
  const prices = useOperatorPrices();
  const [result, setResult] = useState<CreateAccountResult>();
  const [files, setFiles] = useState<SignupFiles>({ references: [] });
  const [logoError, setLogoError] = useState<string>();
  const form = useForm<CreateAccountInput>({ resolver: zodResolver(CreateAccountInput), defaultValues: empty() });
  const [tier, choice] = useWatch({ control: form.control, name: ["account.tier", "branding.choice"] });
  const submit = form.handleSubmit((input) => {
    if (input.branding.choice === "own") {
      if (!files.logo) return setLogoError("Add the clinic's logo, or choose Use the default look");
      if (brandColorProblem(input.branding.brandColor)) return;
    }
    setLogoError(undefined);
    const payment = { ...input.payment, reference: input.payment.reference || undefined };
    create.mutate(
      { input: { ...input, payment }, logo: files.logo, references: files.references },
      {
        onSuccess: setResult,
        // Billing #10: a duplicate name or contact email goes under its own field.
        onError: (e) => showDuplicate(e, form.setError),
      },
    );
  });
  const fieldConflict = !!(form.formState.errors.account?.name || form.formState.errors.account?.contactEmail);

  return (
    <Dialog open onOpenChange={(o) => !o && !result && onClose()}>
      {/* No X once the password shows: "I've passed it on" is the way out, so it isn't lost to a stray click. */}
      <DialogContent showCloseButton={!result} className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{result ? `${result.overview.account.name} is on Primolar` : "New clinic account"}</DialogTitle>
          <DialogDescription>
            {result
              ? "Pass the Owner's sign-in on in person or by phone."
              : "For a clinic signing up by phone or in person. It is created at once, already in its look, once the payment is recorded here."}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <OwnerPassword result={result} onDone={onClose} />
        ) : !prices.data ? (
          <Loading compact label="Loading prices" />
        ) : (
          <FormProvider {...form}>
            <form onSubmit={submit} noValidate className="space-y-6">
              <SignupFields prices={prices.data} files={files} onFilesChange={setFiles} logoError={logoError} />
              <fieldset className="space-y-4 border-t border-line pt-5">
                <legend className="mb-3 text-base font-semibold">Payment received</legend>
                <AmountDueSummary quote={amountDue(prices.data, tier, choice)} />
                <PaymentFields prefix="payment." />
              </fieldset>
              {create.error && !fieldConflict && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Creating" : "Create clinic account"}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
