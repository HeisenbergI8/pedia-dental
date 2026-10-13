"use client";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RecordPrivacyConsentInput, type GuardianView } from "@pedia/shared";
import { CheckField } from "@/components/check-field";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinic, usePrivacyNotice } from "@/features/clinic/api";

/**
 * Privacy #12–#17: the parent's consent. At registration (P12) it is the last step before the child is saved; on the
 * record it is the same form for a child registered before chunk 24 (P17). Mount it only while open, so its
 * defaults follow the guardians it is given. The optional consents start unticked: tick only what the parent says yes to.
 */
export function PrivacyConsentDialog({ childName, guardians, pending, submitLabel, onClose, onConfirm, onCloseAutoFocus }: {
  childName: string;
  guardians: Pick<GuardianView, "id" | "fullName" | "relationship" | "isPrimary">[];
  pending: boolean;
  submitLabel: string;
  onClose: () => void;
  onConfirm: (input: RecordPrivacyConsentInput) => void;
  /** Where focus goes when it closes: mounted without a trigger, so Radix has none to return to. */
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const clinicName = useClinic().data?.account.name ?? "the clinic";
  const notice = usePrivacyNotice().data;
  const primary = guardians.find((g) => g.isPrimary) ?? guardians[0];
  const form = useForm<RecordPrivacyConsentInput>({
    resolver: zodResolver(RecordPrivacyConsentInput),
    defaultValues: { guardianId: primary?.id ?? "", photos: false, reminders: false },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Parent&apos;s consent</DialogTitle>
          <DialogDescription>
            Needed to register {childName}. For a paper signature, print the consent form from the child&apos;s Overview afterwards.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onConfirm)} noValidate className="space-y-5">
            <FormField name="guardianId" label="Who consented">
              {(props) => (
                <Controller
                  control={form.control}
                  name="guardianId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full">
                        <SelectValue placeholder="Choose a guardian" />
                      </SelectTrigger>
                      <SelectContent>
                        {guardians.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.fullName} ({g.relationship})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <CheckField name="confirmed">
              They received {clinicName}&apos;s privacy notice{notice ? ` (version ${notice.version})` : ""} and consent to the clinic keeping{" "}
              {childName}&apos;s treatment records.
            </CheckField>
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold">Optional: ask, and tick only what they agree to</legend>
              <CheckField name="photos">Clinical photos of the teeth, mouth and face</CheckField>
              <CheckField name="reminders">Reminder messages by SMS or email</CheckField>
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Back
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving" : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
