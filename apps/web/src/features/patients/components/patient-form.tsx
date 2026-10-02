"use client";
import type { ReactNode } from "react";
import { Controller, FormProvider, get, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { CreatePatientInput } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-lg border border-line bg-white p-5">
      <legend className="px-1 text-lg font-semibold">{title}</legend>
      {children}
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
  onSubmit,
}: {
  defaultValues?: CreatePatientInput;
  submitLabel: string;
  pending: boolean;
  onSubmit: (input: CreatePatientInput) => void;
}) {
  const form = useForm<CreatePatientInput>({ resolver: zodResolver(CreatePatientInput), defaultValues });
  const { register, control, setValue, getValues } = form;
  const guardians = useFieldArray({ control, name: "guardians" });
  const guardiansError: string | undefined =
    get(form.formState.errors, "guardians")?.message ?? get(form.formState.errors, "guardians.root")?.message;

  function makePrimary(index: number) {
    getValues("guardians").forEach((_, i) => setValue(`guardians.${i}.isPrimary`, i === index));
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        <Section title="Child">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="firstName" label="First name">
              <Input {...register("firstName")} />
            </FormField>
            <FormField name="lastName" label="Last name">
              <Input {...register("lastName")} />
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
            <Input {...register("address")} />
          </FormField>
        </Section>

        <Section title="Guardians">
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
                  <Input type="tel" {...register(`guardians.${i}.phone`)} />
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

        <Section title="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField name="emergencyContact.name" label="Name">
              <Input {...register("emergencyContact.name")} />
            </FormField>
            <FormField name="emergencyContact.phone" label="Phone">
              <Input type="tel" {...register("emergencyContact.phone")} />
            </FormField>
          </div>
        </Section>

        <Section title="Medical">
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

        <Section title="Previous dental history">
          <FormField name="dentalHistory.previousClinic" label="Previous clinic">
            <Input {...register("dentalHistory.previousClinic")} />
          </FormField>
          <FormField name="dentalHistory.notes" label="Notes">
            <Textarea rows={3} {...register("dentalHistory.notes")} />
          </FormField>
        </Section>

        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </form>
    </FormProvider>
  );
}
