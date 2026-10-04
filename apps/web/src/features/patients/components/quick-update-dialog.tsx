"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ZapIcon } from "lucide-react";
import { toast } from "sonner";
import { QuickUpdatePatientInput, TAG_SUGGESTIONS, sameText, type PatientView } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/access";
import { useQuickUpdatePatient } from "../api";
import { TagInput, reservedTagReason } from "./tag-input";

// Without patients.contact the phone is neither shown nor sent (undefined is left out of the JSON).
const valuesOf = (p: PatientView, canContact: boolean): QuickUpdatePatientInput => ({
  phone: canContact ? (p.guardians.find((g) => g.isPrimary) ?? p.guardians[0]).phone : undefined,
  nickname: p.nickname ?? "",
  tags: p.tags ?? [],
  alerts: p.alerts,
});

/** Phone, nickname, tags and alerts in one small dialog: the edits front desk makes most, without the 5-step form. */
export function QuickUpdateDialog({ patient: p }: { patient: PatientView }) {
  const canContact = useCan()("patients.contact");
  const [open, setOpen] = useState(false);
  const update = useQuickUpdatePatient(p.id);
  const form = useForm<QuickUpdatePatientInput>({ resolver: zodResolver(QuickUpdatePatientInput), defaultValues: valuesOf(p, canContact) });
  const guardian = p.guardians.find((g) => g.isPrimary) ?? p.guardians[0];

  const onSubmit = (input: QuickUpdatePatientInput) =>
    update.mutate(input, {
      onSuccess: () => {
        toast.success(`${p.firstName}'s details updated`);
        setOpen(false);
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <Dialog open={open} onOpenChange={(next) => (next && form.reset(valuesOf(p, canContact)), setOpen(next))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><ZapIcon /> Quick update</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quick update</DialogTitle>
          <DialogDescription>Everything else is in Edit profile.</DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            {canContact && (
              <FormField name="phone" label={`${guardian.relationship}'s phone (${guardian.fullName})`}>
                <Input type="tel" inputMode="tel" autoComplete="tel" {...form.register("phone")} />
              </FormField>
            )}
            <FormField name="nickname" label="Nickname (optional)">
              <Input autoComplete="off" placeholder="e.g. Luke" {...form.register("nickname")} />
            </FormField>
            <FormField name="tags" label="Tags (optional)">
              {(props) => (
                <Controller
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <div className="space-y-2">
                      <TagInput {...props} value={field.value} onChange={field.onChange} placeholder="e.g. Anxious" reject={reservedTagReason} />
                      <div className="flex flex-wrap gap-1.5" aria-label="Suggested tags">
                        {TAG_SUGGESTIONS.filter((t) => !field.value.some((v) => sameText(v) === sameText(t))).map((t) => (
                          <Button key={t} type="button" size="sm" variant="outline" onClick={() => field.onChange([...field.value, t])}>
                            + {t}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                />
              )}
            </FormField>
            <FormField name="alerts" label="Important notes and alerts">
              {(props) => (
                <Controller
                  control={form.control}
                  name="alerts"
                  render={({ field }) => <TagInput {...props} value={field.value} onChange={field.onChange} placeholder="e.g. Strong gag reflex" />}
                />
              )}
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={update.isPending}>{update.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
