"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Controller, FormProvider, get, useFieldArray, useForm, type FieldErrors, type FieldPath, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { BloodType, CreatePatientInput, EditPatientWithoutContactsInput, type GuardianView } from "@pedia/shared";

/** The form's values: a patient whose guardians may lack a phone (an edit by someone without patients.contact). */
export type PatientFormValues = Omit<CreatePatientInput, "guardians"> & { guardians: GuardianView[] };
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PHONE, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { TagInput, reservedTagReason } from "./tag-input";

const newGuardian = (isPrimary: boolean) => ({
  id: crypto.randomUUID(),
  fullName: "",
  relationship: "",
  phone: "",
  isPrimary,
});

const EMPTY: PatientFormValues = {
  firstName: "",
  lastName: "",
  nickname: "",
  birthDate: "",
  sex: "female",
  address: "",
  guardians: [newGuardian(true)],
  emergencyContact: { name: "", phone: "" },
  allergies: [],
  medicalConditions: [],
  medications: [],
  alerts: [],
  tags: [],
  dentalHistory: { previousClinic: "", notes: "" },
  profile: {},
};

const NOT_KNOWN = "unknown"; // Radix Select can't hold an empty value

/** An empty optional input arrives as "", which `.email()` would reject. */
const blankToUndefined = (v: string) => v || undefined;

/**
 * Phones fill the form one step at a time (a 2,000px form is easy to get lost in, and errors land far
 * from the button). Every section stays mounted, so nothing typed is lost between steps; desktop shows
 * them all. `fields` are what Next validates before moving on.
 */
const STEPS: { title: string; fields: FieldPath<PatientFormValues>[] }[] = [
  { title: "Child", fields: ["firstName", "lastName", "nickname", "birthDate", "sex", "address", "tags", "profile.school", "profile.referredBy"] },
  { title: "Guardians", fields: ["guardians"] },
  { title: "Emergency contact", fields: ["emergencyContact"] },
  {
    title: "Medical",
    fields: ["allergies", "medicalConditions", "medications", "alerts", "profile.bloodType", "profile.hmo", "profile.familyDoctor"],
  },
  {
    title: "Dental history",
    fields: ["dentalHistory", "profile.diet", "profile.brushing", "profile.badDentalExperience", "profile.fluorideHistory"],
  },
];
const stepOf = (errors: FieldErrors<PatientFormValues>) =>
  Math.max(0, STEPS.findIndex((s) => s.fields.some((f) => f in errors)));

function Section({ title, description, hidden, children }: { title: string; description?: string; hidden?: boolean; children: ReactNode }) {
  return (
    <fieldset className={cn("min-w-0 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5", hidden && "hidden")}>
      {/* Floated so the legend sits inside the card instead of on its border. */}
      <legend className="float-left mb-4 w-full">
        <span className="block text-base font-semibold">{title}</span>
        {description && <span className="block text-sm text-ink-muted">{description}</span>}
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

const LISTS = [
  ["allergies", "Allergies", "e.g. Penicillin"],
  ["medicalConditions", "Medical conditions", "e.g. Asthma"],
  ["medications", "Current medications", "e.g. Salbutamol inhaler"],
  ["alerts", "Important notes and alerts", "e.g. Strong gag reflex"],
] as const;

export function PatientForm({
  defaultValues = EMPTY,
  submitLabel,
  pending,
  cancelHref,
  onSubmit,
  hideContacts = false,
}: {
  defaultValues?: PatientFormValues;
  submitLabel: string;
  pending: boolean;
  cancelHref: string;
  onSubmit: (input: PatientFormValues) => void;
  /**
   * Editing without patients.contact (a dentist): the API never sent guardian phones, emails, the emergency contact
   * or the address, so none are shown and none are sent. The server keeps the stored ones (EditPatientWithoutContactsInput).
   */
  hideContacts?: boolean;
}) {
  // Both schemas' outputs fit PatientFormValues; the cast is only because Resolver is invariant in its values type.
  const resolver = zodResolver(hideContacts ? EditPatientWithoutContactsInput : CreatePatientInput) as unknown as Resolver<PatientFormValues>;
  const form = useForm<PatientFormValues>({ resolver, defaultValues });
  const { register, control, setValue, getValues } = form;
  const guardians = useFieldArray({ control, name: "guardians" });
  const guardiansError: string | undefined =
    get(form.formState.errors, "guardians")?.message ?? get(form.formState.errors, "guardians.root")?.message;

  const isPhone = useMediaQuery(PHONE);
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const shown = (i: number) => !isPhone || i === step;
  async function next() {
    if (await form.trigger(STEPS[step].fields)) {
      setStep(step + 1);
      window.scrollTo({ top: 0 });
    }
  }

  function makePrimary(index: number) {
    getValues("guardians").forEach((_, i) => setValue(`guardians.${i}.isPrimary`, i === index));
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, (errors) => isPhone && setStep(stepOf(errors)))}
        noValidate
        className="max-w-3xl space-y-5"
      >
        {isPhone && (
          <div aria-live="polite" className="space-y-2">
            <p className="text-sm font-medium">
              Step {step + 1} of {STEPS.length} · {STEPS[step].title}
            </p>
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((s, i) => (
                <span key={s.title} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-brand" : "bg-line")} />
              ))}
            </div>
          </div>
        )}
        <Section title="Child" hidden={!shown(0)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="firstName" label="First name">
              <Input autoComplete="off" {...register("firstName")} />
            </FormField>
            <FormField name="lastName" label="Last name">
              <Input autoComplete="off" {...register("lastName")} />
            </FormField>
            <FormField name="nickname" label="Nickname (optional)">
              <Input autoComplete="off" placeholder="What the child likes to be called" {...register("nickname")} />
            </FormField>
            <FormField name="birthDate" label="Date of birth">
              <Input type="date" {...register("birthDate")} />
            </FormField>
            <FormField name="sex" label="Sex">
              {(props) => (
                <Controller
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...props} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="male">Male</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
          </div>
          {!hideContacts && (
            <FormField name="address" label="Address">
              <Input autoComplete="street-address" {...register("address")} />
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="profile.school" label="School (optional)">
              <Input autoComplete="off" {...register("profile.school")} />
            </FormField>
            <FormField name="profile.referredBy" label="Referred by (optional)">
              <Input autoComplete="off" placeholder="e.g. Dr. Ramos, a friend, Facebook" {...register("profile.referredBy")} />
            </FormField>
          </div>
          <FormField name="tags" label="Tags (optional)">
            {(props) => (
              <Controller
                control={control}
                name="tags"
                render={({ field }) => (
                  <TagInput {...props} value={field.value ?? []} onChange={field.onChange} placeholder="e.g. Anxious" reject={reservedTagReason} />
                )}
              />
            )}
          </FormField>
        </Section>

        <Section title="Guardians" description="The primary contact receives reminders and signs consents." hidden={!shown(1)}>
          {guardians.fields.map((g, i) => (
            <div key={g.id} className="space-y-4 border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name={`guardians.${i}.fullName`} label="Full name">
                  <Input {...register(`guardians.${i}.fullName`)} />
                </FormField>
                <FormField name={`guardians.${i}.relationship`} label="Relationship">
                  <Input placeholder="Mother, father, grandparent" {...register(`guardians.${i}.relationship`)} />
                </FormField>
                {!hideContacts && (
                  <>
                    <FormField name={`guardians.${i}.phone`} label="Phone">
                      <Input type="tel" inputMode="tel" autoComplete="off" placeholder="0917 123 4567" {...register(`guardians.${i}.phone`)} />
                    </FormField>
                    <FormField name={`guardians.${i}.email`} label="Email (optional)">
                      <Input type="email" {...register(`guardians.${i}.email`, { setValueAs: blankToUndefined })} />
                    </FormField>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Controller
                  control={control}
                  name={`guardians.${i}.isPrimary`}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`guardian-${g.id}-primary`}
                        checked={field.value}
                        onCheckedChange={(checked) => (checked ? makePrimary(i) : field.onChange(false))}
                      />
                      <Label htmlFor={`guardian-${g.id}-primary`}>Primary contact</Label>
                    </div>
                  )}
                />
                {guardians.fields.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => guardians.remove(i)}>
                    <Trash2Icon /> Remove guardian
                  </Button>
                )}
              </div>
            </div>
          ))}
          {guardiansError && <p className="text-sm text-danger">{guardiansError}</p>}
          {hideContacts ? (
            <p className="text-sm text-ink-muted">Phone numbers and new guardians are handled by front desk and admin.</p>
          ) : (
            <Button type="button" variant="outline" onClick={() => guardians.append(newGuardian(false))}>
              <PlusIcon /> Add guardian
            </Button>
          )}
        </Section>

        <Section title="Emergency contact (optional)" description="Someone to call if the guardians can't be reached." hidden={!shown(2)}>
          {hideContacts ? (
            <p className="text-sm text-ink-muted">Contact details are visible to front desk and admin.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="emergencyContact.name" label="Name">
                <Input {...register("emergencyContact.name")} />
              </FormField>
              <FormField name="emergencyContact.phone" label="Phone">
                <Input type="tel" inputMode="tel" autoComplete="off" {...register("emergencyContact.phone")} />
              </FormField>
            </div>
          )}
        </Section>

        <Section title="Medical" description="Shown on every patient screen. Press Enter after each item." hidden={!shown(3)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {LISTS.map(([name, label, placeholder]) => (
              <FormField key={name} name={name} label={label}>
                {(props) => (
                  <Controller
                    control={control}
                    name={name}
                    render={({ field }) => (
                      <TagInput {...props} value={field.value} onChange={field.onChange} placeholder={placeholder} />
                    )}
                  />
                )}
              </FormField>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="profile.bloodType" label="Blood type (optional)">
              {(props) => (
                <Controller
                  control={control}
                  name="profile.bloodType"
                  render={({ field }) => (
                    <Select value={field.value ?? NOT_KNOWN} onValueChange={(v) => field.onChange(v === NOT_KNOWN ? undefined : v)}>
                      <SelectTrigger {...props} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOT_KNOWN}>Not known</SelectItem>
                        {BloodType.options.map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField name="profile.hmo" label="HMO / insurance (optional)">
              <Input autoComplete="off" placeholder="Provider and member number" {...register("profile.hmo")} />
            </FormField>
            <FormField name="profile.familyDoctor" label="Family doctor (optional)">
              <Input autoComplete="off" {...register("profile.familyDoctor")} />
            </FormField>
          </div>
        </Section>

        <Section title="Previous dental history" hidden={!shown(4)}>
          <FormField name="dentalHistory.previousClinic" label="Previous clinic">
            <Input {...register("dentalHistory.previousClinic")} />
          </FormField>
          <FormField name="dentalHistory.notes" label="Notes">
            <Textarea rows={3} {...register("dentalHistory.notes")} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="profile.diet" label="Diet (optional)">
              <Textarea rows={2} placeholder="Sweets, juice, bottle at night" {...register("profile.diet")} />
            </FormField>
            <FormField name="profile.brushing" label="Brushing habits (optional)">
              <Textarea rows={2} {...register("profile.brushing")} />
            </FormField>
            <FormField name="profile.badDentalExperience" label="Bad past dental experience (optional)">
              <Textarea rows={2} {...register("profile.badDentalExperience")} />
            </FormField>
            <FormField name="profile.fluorideHistory" label="Fluoride history (optional)">
              <Textarea rows={2} {...register("profile.fluorideHistory")} />
            </FormField>
          </div>
        </Section>

        {/* Pinned to the bottom so saving never needs a scroll back down a long form. */}
        <div className="sticky bottom-(--bottom-nav-h) z-(--z-sticky) -mx-4 flex items-center justify-end gap-2 border-t border-line bg-ground/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
          {isPhone && step > 0 ? (
            <Button type="button" variant="ghost" className="mr-auto" onClick={() => setStep(step - 1)}>
              <ChevronLeftIcon /> Back
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          )}
          {/* Separate keys: one reused element would turn into the submit button while Next's tap is still being
              handled, and the browser would submit from step 4 straight past step 5. */}
          {isPhone && !last ? (
            <Button key="next" type="button" onClick={next}>
              Next <ChevronRightIcon />
            </Button>
          ) : (
            <Button key="submit" type="submit" disabled={pending}>
              {pending ? "Saving" : submitLabel}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
