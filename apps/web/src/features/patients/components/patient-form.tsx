"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Controller, FormProvider, get, useFieldArray, useForm, type FieldErrors, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { CreatePatientInput } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PHONE, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { TagInput } from "./tag-input";

const newGuardian = (isPrimary: boolean) => ({
  id: crypto.randomUUID(),
  fullName: "",
  relationship: "",
  phone: "",
  isPrimary,
});

const EMPTY: CreatePatientInput = {
  firstName: "",
  lastName: "",
  birthDate: "",
  sex: "female",
  address: "",
  guardians: [newGuardian(true)],
  emergencyContact: { name: "", phone: "" },
  allergies: [],
  medicalConditions: [],
  medications: [],
  alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
};

/** An empty optional input arrives as "", which `.email()` would reject. */
const blankToUndefined = (v: string) => v || undefined;

/**
 * Phones fill the form one step at a time (a 2,000px form is easy to get lost in, and errors land far
 * from the button). Every section stays mounted, so nothing typed is lost between steps; desktop shows
 * them all. `fields` are what Next validates before moving on.
 */
const STEPS: { title: string; fields: FieldPath<CreatePatientInput>[] }[] = [
  { title: "Child", fields: ["firstName", "lastName", "birthDate", "sex", "address"] },
  { title: "Guardians", fields: ["guardians"] },
  { title: "Emergency contact", fields: ["emergencyContact"] },
  { title: "Medical", fields: ["allergies", "medicalConditions", "medications", "alerts"] },
  { title: "Dental history", fields: ["dentalHistory"] },
];
const stepOf = (errors: FieldErrors<CreatePatientInput>) =>
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
}: {
  defaultValues?: CreatePatientInput;
  submitLabel: string;
  pending: boolean;
  cancelHref: string;
  onSubmit: (input: CreatePatientInput) => void;
}) {
  const form = useForm<CreatePatientInput>({ resolver: zodResolver(CreatePatientInput), defaultValues });
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
          <FormField name="address" label="Address">
            <Input autoComplete="street-address" {...register("address")} />
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
                  <Input placeholder="Mother, father, grandparent…" {...register(`guardians.${i}.relationship`)} />
                </FormField>
                <FormField name={`guardians.${i}.phone`} label="Phone">
                  <Input type="tel" inputMode="tel" autoComplete="off" placeholder="0917 123 4567" {...register(`guardians.${i}.phone`)} />
                </FormField>
                <FormField name={`guardians.${i}.email`} label="Email (optional)">
                  <Input type="email" {...register(`guardians.${i}.email`, { setValueAs: blankToUndefined })} />
                </FormField>
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
          <Button type="button" variant="outline" onClick={() => guardians.append(newGuardian(false))}>
            <PlusIcon /> Add guardian
          </Button>
        </Section>

        <Section title="Emergency contact (optional)" description="Someone to call if the guardians can't be reached." hidden={!shown(2)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="emergencyContact.name" label="Name">
              <Input {...register("emergencyContact.name")} />
            </FormField>
            <FormField name="emergencyContact.phone" label="Phone">
              <Input type="tel" inputMode="tel" autoComplete="off" {...register("emergencyContact.phone")} />
            </FormField>
          </div>
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
        </Section>

        <Section title="Previous dental history" hidden={!shown(4)}>
          <FormField name="dentalHistory.previousClinic" label="Previous clinic">
            <Input {...register("dentalHistory.previousClinic")} />
          </FormField>
          <FormField name="dentalHistory.notes" label="Notes">
            <Textarea rows={3} {...register("dentalHistory.notes")} />
          </FormField>
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
          {isPhone && !last ? (
            <Button type="button" onClick={next}>
              Next <ChevronRightIcon />
            </Button>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          )}
        </div>
      </form>
    </FormProvider>
  );
}
