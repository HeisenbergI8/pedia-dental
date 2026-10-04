"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { AddConsentInput, ConsentScope, type PatientView } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONSENT_LABEL, useAddConsent } from "../api";

export function ConsentDialog({ patient }: { patient: PatientView }) {
  const [open, setOpen] = useState(false);
  const addConsent = useAddConsent(patient.id);
  const primary = patient.guardians.find((g) => g.isPrimary) ?? patient.guardians[0];
  const form = useForm<AddConsentInput>({
    resolver: zodResolver(AddConsentInput),
    defaultValues: { guardianId: primary.id, scope: "general_treatment", date: format(new Date(), "yyyy-MM-dd") },
  });

  function onSubmit(input: AddConsentInput) {
    addConsent.mutate(input, {
      onSuccess: () => {
        toast.success("Consent recorded");
        setOpen(false);
        form.reset();
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">Record consent</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record consent</DialogTitle>
          <DialogDescription>Consent records can&apos;t be edited once saved.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormField name="guardianId" label="Given by">
              {(props) => (
                <Controller
                  control={form.control}
                  name="guardianId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {patient.guardians.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.fullName} ({g.relationship})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField name="scope" label="Consent to">
              {(props) => (
                <Controller
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ConsentScope.options.map((s) => (
                          <SelectItem key={s} value={s}>{CONSENT_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField name="date" label="Date">
              <Input type="date" {...form.register("date")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={addConsent.isPending}>
                {addConsent.isPending ? "Saving…" : "Save consent"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
