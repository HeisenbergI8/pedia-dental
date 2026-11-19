"use client";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { SupportContact, SupportSettings, TIER_LABEL, TIER_SUPPORT, type Tier } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSaveSupportContact, useSaveSupportSettings, useSupportContact, useSupportSettings } from "../api";

/** A blank optional field is none (null on the wire). */
const blank = (s: string) => s.trim() || null;

const SettingsForm = z.object({ email: z.string(), chatUrl: z.string() }).transform((f, ctx) => {
  const parsed = SupportSettings.safeParse({ email: blank(f.email), chatUrl: blank(f.chatUrl) });
  if (!parsed.success) for (const i of parsed.error.issues) ctx.addIssue({ code: "custom", message: i.message, path: i.path });
  return parsed.success ? parsed.data : z.NEVER;
});

/** D12: what "Contact support" opens: the email on every plan, the chat link on Clinic and Pro. */
export function SupportSettingsCard() {
  const settings = useSupportSettings();
  const save = useSaveSupportSettings();
  const form = useForm<z.input<typeof SettingsForm>, unknown, SupportSettings>({
    resolver: zodResolver(SettingsForm),
    values: { email: settings.data?.email ?? "", chatUrl: settings.data?.chatUrl ?? "" },
  });
  if (settings.isLoading) return <Loading compact label="Loading the support details" />;
  if (settings.error) return <ErrorState what="the support details" onRetry={() => void settings.refetch()} />;
  const submit = form.handleSubmit((input) => save.mutate(input, { onSuccess: () => toast.success("Support details saved") }));
  return (
    <SectionCard
      title="Support details"
      description={`What "Contact support" shows clinics: ${TIER_LABEL.small} gets the email, ${TIER_LABEL.mid} the chat link, ${TIER_LABEL.big} its named contact.`}
    >
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="email" label="Support email" optional>
              <Input type="email" autoComplete="off" {...form.register("email")} />
            </FormField>
            <FormField name="chatUrl" label="Chat link" optional hint="Starts with https://">
              <Input type="url" autoComplete="off" {...form.register("chatUrl")} />
            </FormField>
          </div>
          {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>{save.isPending ? "Saving" : "Save support details"}</Button>
        </form>
      </FormProvider>
    </SectionCard>
  );
}

const ContactForm = z.object({ name: z.string(), phone: z.string(), email: z.string() }).transform((f, ctx) => {
  const parsed = SupportContact.safeParse({ name: f.name, phone: blank(f.phone), email: blank(f.email) });
  if (!parsed.success) for (const i of parsed.error.issues) ctx.addIssue({ code: "custom", message: i.message, path: i.path });
  return parsed.success ? parsed.data : z.NEVER;
});

/** D12: a clinic's named Primolar contact. Shown to the Owner on Pro; kept on any plan, so an upgrade has it. */
export function SupportContactCard({ clinicId, tier }: { clinicId: string; tier: Tier }) {
  const contact = useSupportContact(clinicId);
  const save = useSaveSupportContact(clinicId);
  const form = useForm<z.input<typeof ContactForm>, unknown, SupportContact>({
    resolver: zodResolver(ContactForm),
    values: { name: contact.data?.name ?? "", phone: contact.data?.phone ?? "", email: contact.data?.email ?? "" },
  });
  if (contact.isLoading) return <Loading compact label="Loading the support contact" />;
  if (contact.error) return <ErrorState what="the support contact" onRetry={() => void contact.refetch()} />;
  const submit = form.handleSubmit((input) => save.mutate(input, { onSuccess: () => toast.success("Support contact saved") }));
  return (
    <SectionCard
      title="Support contact"
      description={
        TIER_SUPPORT[tier].channel === "contact"
          ? "The person this clinic reaches through Contact support."
          : `Only ${TIER_LABEL.big} clinics see a named contact. This one is kept for when the clinic moves up.`
      }
    >
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField name="name" label="Name">
              <Input autoComplete="off" {...form.register("name")} />
            </FormField>
            <FormField name="phone" label="Phone" optional>
              <Input type="tel" autoComplete="off" {...form.register("phone")} />
            </FormField>
            <FormField name="email" label="Email" optional>
              <Input type="email" autoComplete="off" {...form.register("email")} />
            </FormField>
          </div>
          {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
          <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>{save.isPending ? "Saving" : "Save support contact"}</Button>
        </form>
      </FormProvider>
    </SectionCard>
  );
}
