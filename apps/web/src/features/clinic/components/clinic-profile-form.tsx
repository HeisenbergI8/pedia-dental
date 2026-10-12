"use client";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UpdateClinicProfileInput, formatTin } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClinic, useUpdateClinicProfile } from "../api";

/** The account's name, contact email and TIN (decisions #18, #42). Tier and status are the operator's. */
export function ClinicProfileForm() {
  const account = useClinic().data?.account;
  const save = useUpdateClinicProfile();
  const form = useForm<UpdateClinicProfileInput>({
    resolver: zodResolver(UpdateClinicProfileInput),
    values: account && { name: account.name, contactEmail: account.contactEmail, tin: account.tin },
  });
  if (!account) return <Loading compact label="Loading clinic details" />;
  const submit = form.handleSubmit((input) => save.mutate(input, { onSuccess: () => toast.success("Clinic details saved") }));

  return (
    <SectionCard title="Clinic details" description="Shown on receipts, documents and the parent portal.">
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="grid gap-4 sm:max-w-lg">
          <FormField name="name" label="Clinic name">
            <Input autoComplete="organization" {...form.register("name")} />
          </FormField>
          <FormField name="contactEmail" label="Contact email">
            <Input type="email" autoComplete="email" {...form.register("contactEmail")} />
          </FormField>
          <FormField name="tin" label="TIN" hint="9 digits, then the branch code if you have one">
            <Input
              inputMode="numeric"
              value={form.watch("tin") ?? ""}
              onChange={(e) => form.setValue("tin", formatTin(e.target.value), { shouldValidate: form.formState.isSubmitted, shouldDirty: true })}
            />
          </FormField>
          {save.error && <p className="text-sm text-danger">{save.error.message}</p>}
          <Button type="submit" disabled={save.isPending} className="justify-self-start">
            {save.isPending ? "Saving" : "Save details"}
          </Button>
        </form>
      </FormProvider>
    </SectionCard>
  );
}
