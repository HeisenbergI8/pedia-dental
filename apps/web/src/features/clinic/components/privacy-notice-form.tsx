"use client";
import Link from "next/link";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { PENDING_REVIEW, SavePrivacyNoticeInput, noticeTemplate } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { useClinic, usePrivacyNotice, useSavePrivacyNotice } from "../api";

/**
 * Privacy #19, #22: the Owner's notice to parents and the clinic's privacy contact. Saving makes a new version, and
 * each parent reads it once at their next portal visit (#20). Consents already recorded keep the version agreed to.
 */
export function PrivacyNoticeForm() {
  const notice = usePrivacyNotice().data;
  const account = useClinic().data?.account;
  const save = useSavePrivacyNotice();
  const form = useForm<SavePrivacyNoticeInput>({
    resolver: zodResolver(SavePrivacyNoticeInput),
    values: notice && { body: notice.body, contactName: notice.contactName, contactEmail: notice.contactEmail },
  });
  if (!notice || !account) return <Loading compact label="Loading the privacy notice" />;
  const submit = form.handleSubmit((input) =>
    save.mutate(input, { onSuccess: (v) => toast.success(`Saved as version ${v.version}. Parents read it at their next portal visit.`) }),
  );

  return (
    <SectionCard
      title="Privacy notice"
      description={`Version ${notice.version}, saved ${formatDate(notice.at.slice(0, 10))} by ${notice.savedByName}. Saving makes a new version, which every parent reads again. ${PENDING_REVIEW}: have your lawyer check it.`}
    >
      <FormProvider {...form}>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="contactName" label="Privacy contact">
              <Input autoComplete="name" {...form.register("contactName")} />
            </FormField>
            <FormField name="contactEmail" label="Privacy contact's email">
              <Input type="email" autoComplete="email" {...form.register("contactEmail")} />
            </FormField>
          </div>
          <FormField name="body" label="Notice to parents" hint="Plain language. A blank line starts a new paragraph.">
            <Textarea rows={14} {...form.register("body")} />
          </FormField>
          {save.error && <p className="text-sm text-danger">{save.error.message}</p>}
          <div className="flex flex-wrap items-center gap-3">
            {/* An unchanged notice would ask every parent to read it again for nothing. */}
            <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>
              {save.isPending ? "Saving" : "Save new version"}
            </Button>
            <Button type="button" variant="outline" onClick={() => form.setValue("body", noticeTemplate(account.name), { shouldDirty: true })}>
              Start from Primolar&apos;s template
            </Button>
            <Link href={`/legal/notice/${account.id}`} target="_blank" className="text-sm font-semibold text-brand underline underline-offset-2">
              See the public page
            </Link>
          </div>
        </form>
      </FormProvider>
    </SectionCard>
  );
}
