"use client";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parseISO } from "date-fns";
import { AlertTriangleIcon, HourglassIcon } from "lucide-react";
import { RECEIPT_RULES, ReceiptUploadInput, imageProblem, type ReceiptView } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const Form = ReceiptUploadInput.extend({
  file: z.custom<File | undefined>().superRefine((f, ctx) => {
    const problem = imageProblem(RECEIPT_RULES, f);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
});
type Form = z.infer<typeof Form>;

/**
 * B12 decisions 6, 7, 21: the receipt for what is due. Pending: what Primolar is checking, and no form (one at a time).
 * Rejected: the reason, then the form again. Confirmed or none: the form, unless the caller hides it.
 */
export function ReceiptUpload({
  latest,
  onSubmit,
  pending,
  error,
}: {
  latest: ReceiptView | null | undefined;
  onSubmit: (input: ReceiptUploadInput, file: File) => void;
  pending: boolean;
  error?: string;
}) {
  const form = useForm<Form>({ resolver: zodResolver(Form), defaultValues: { reference: "", file: undefined } });

  if (latest?.status === "pending") {
    return (
      <p role="status" className="flex gap-2.5 rounded-lg border border-line px-4 py-3 text-sm">
        <HourglassIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Primolar is checking your receipt (ref <span className="font-mono">{latest.reference}</span>), sent{" "}
          {format(parseISO(latest.uploadedAt), "d MMMM yyyy")}.
        </span>
      </p>
    );
  }

  // A sent receipt is pending, so this form unmounts: nothing to reset.
  const submit = form.handleSubmit(({ file, ...input }) => onSubmit(input, file!));
  return (
    <div className="space-y-3">
      {latest?.status === "rejected" && (
        <p role="alert" className="flex gap-2.5 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-warning">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Not accepted: {latest.rejectionReason}. Send a new receipt.</span>
        </p>
      )}
      <FormProvider {...form}>
        <form noValidate onSubmit={submit} aria-label="Send your receipt" className="grid max-w-md gap-4">
          <FormField name="file" label="Receipt screenshot" hint="PNG, JPG or WebP, up to 5 MB">
            {(control) => (
              <Controller
                name="file"
                control={form.control}
                render={({ field }) => (
                  <Input {...control} type="file" accept={RECEIPT_RULES.types.join(",")} onChange={(e) => field.onChange(e.target.files?.[0])} />
                )}
              />
            )}
          </FormField>
          <FormField name="reference" label="Reference number" hint="The transaction or reference number on the receipt">
            <Input autoComplete="off" {...form.register("reference")} />
          </FormField>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={pending} className="justify-self-start">
            {pending ? "Sending" : "Send receipt"}
          </Button>
        </form>
      </FormProvider>
    </div>
  );
}
