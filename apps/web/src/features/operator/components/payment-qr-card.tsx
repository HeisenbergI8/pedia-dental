"use client";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { PaymentQrInput, QR_RULES, imageProblem } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { paymentQrImageUrl } from "@/features/signup/api";
import { usePaymentQr, useSavePaymentQr } from "../api";

type Form = z.input<typeof PaymentQrInput>;

/** B12 decisions 5, 23: the one QR every clinic and sign-up pays to, with the words under it. Replaceable any time. */
export function PaymentQrCard() {
  const qr = usePaymentQr();
  const save = useSavePaymentQr();
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const form = useForm<Form, unknown, PaymentQrInput>({ resolver: zodResolver(PaymentQrInput), values: { caption: qr.data?.caption ?? "" } });
  if (qr.isLoading) return <Loading compact label="Loading the payment QR" />;
  if (qr.error) return <ErrorState what="the payment QR" onRetry={() => void qr.refetch()} />;
  const current = qr.data ?? null;

  const submit = form.handleSubmit((input) => {
    const problem = file ? imageProblem(QR_RULES, file) : current ? undefined : "Add the QR image";
    setFileError(problem);
    if (problem) return;
    save.mutate({ input, file }, { onSuccess: () => { toast.success("Payment QR saved"); setFile(undefined); } });
  });

  return (
    <SectionCard title="Payment QR" description="Clinics and sign-ups scan this to pay, then send a receipt to Payments to check.">
      <div className="flex flex-col gap-5 sm:flex-row">
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the API
          <img src={paymentQrImageUrl(current)} alt="Primolar's payment QR code" className="size-40 shrink-0 rounded-md border border-line object-contain" />
        ) : (
          <p className="text-sm text-ink-muted sm:w-40">No QR yet: clinics see &ldquo;Primolar will send you payment details&rdquo;.</p>
        )}
        <FormProvider {...form}>
          <form onSubmit={submit} noValidate aria-label="Payment QR" className="grid flex-1 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qr-file" className="text-sm font-semibold">{current ? "Replace QR" : "QR image"}</label>
              <p id="qr-file-hint" className="text-sm text-ink-muted">PNG, JPG or WebP, up to 2 MB</p>
              <Input
                id="qr-file"
                type="file"
                accept={QR_RULES.types.join(",")}
                aria-describedby={fileError ? "qr-file-hint qr-file-error" : "qr-file-hint"}
                aria-invalid={!!fileError}
                onChange={(e) => (setFile(e.target.files?.[0]), setFileError(undefined))}
              />
              {fileError && <p id="qr-file-error" className="text-sm text-danger">{fileError}</p>}
            </div>
            <FormField name="caption" label="Text under the QR" optional hint="For example the account name and number">
              <Textarea rows={2} {...form.register("caption")} />
            </FormField>
            {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
            <Button type="submit" disabled={save.isPending} className="justify-self-start">{save.isPending ? "Saving" : "Save payment QR"}</Button>
          </form>
        </FormProvider>
      </div>
    </SectionCard>
  );
}
