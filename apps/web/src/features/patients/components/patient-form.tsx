"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Controller, FormProvider, get, useFieldArray, useForm, useFormContext, useWatch, type FieldPath, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { parseISO } from "date-fns";
import { PlusIcon, Trash2Icon } from "lucide-react";
import type { z } from "zod";
import { BloodType, CreatePatientInput, EditPatientWithoutContactsInput, TAG_SUGGESTIONS, type GuardianView } from "@pedia/shared";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { OptionalSection } from "@/components/optional-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatAge } from "../age";
import { RELATIONSHIPS, phoneAfterPrefix, relationshipChoice, storedPhone, withMedicalAnswers } from "../intake";
import { IntakeProgress } from "./intake-progress";
import { TagInput, reservedTagReason } from "./tag-input";

/** What a submit produces: a patient whose guardians may lack a phone (an edit by someone without patients.contact). */
export type PatientFormValues = Omit<CreatePatientInput, "guardians"> & { guardians: GuardianView[] };
/** What the form holds while typing: sex has no default (never preselected). */
export type PatientFormDraft = Omit<PatientFormValues, "sex"> & { sex?: PatientFormValues["sex"] };

const newGuardian = (isPrimary: boolean) => ({
  id: crypto.randomUUID(),
  fullName: "",
  relationship: "",
  phone: "",
  isPrimary,
});

/** A blank registration. */
export const EMPTY_PATIENT: PatientFormDraft = {
  firstName: "",
  lastName: "",
  nickname: "",
  birthDate: "",
  sex: undefined,
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

const DENTAL_PROFILE = [
  ["profile.diet", "Diet", "Sweets, juice, bottle at night"],
  ["profile.brushing", "Brushing habits", undefined],
  ["profile.badDentalExperience", "Bad past dental experience", undefined],
  ["profile.fluorideHistory", "Fluoride history", undefined],
] as const satisfies readonly (readonly [FieldPath<PatientFormDraft>, string, string | undefined])[];

const NOT_KNOWN = "unknown"; // Radix Select can't hold an empty value

/** An empty optional input arrives as "", which `.email()` would reject. */
const blankToUndefined = (v: string) => v || undefined;

/**
 * Form-only rules on top of the shared schema, which keeps accepting unanswered records (older rows, the API): intake
 * must answer both medical questions, and the guardian prefill (the child's surname) alone isn't a name.
 */
const intakeRules = (
  v: { lastName?: string; guardians?: { fullName?: string }[]; noKnownAllergies?: boolean; noKnownConditions?: boolean },
  ctx: z.RefinementCtx,
) => {
  if (v.noKnownAllergies === undefined) ctx.addIssue({ code: "custom", path: ["noKnownAllergies"], message: "Say whether the child has any allergies" });
  if (v.noKnownConditions === undefined)
    ctx.addIssue({ code: "custom", path: ["noKnownConditions"], message: "Say whether the child has any conditions or takes medicines" });
  const surname = v.lastName?.trim().toLowerCase();
  if (surname && v.guardians?.[0]?.fullName?.trim().toLowerCase() === surname)
    ctx.addIssue({ code: "custom", path: ["guardians", 0, "fullName"], message: "Add the guardian's first name" });
};

/**
 * zod skips refinements once a field fails its type (sex still unpicked), so these errors would only show on a second
 * Save. `when` runs them on every parse, so one Save lists everything missing; intakeRules reads values defensively.
 */
const INTAKE_ALWAYS = { when: () => true };

/** "6 y 3 m" under a whole, past birth date; nothing while it's still being typed. */
const ageHint = (birthDate: string) => (/^\d{4}-\d{2}-\d{2}$/.test(birthDate) && parseISO(birthDate) <= new Date() ? formatAge(birthDate) : undefined);

function Section({ id, title, description, className, children }: { id?: string; title: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <fieldset id={id} className={cn("min-w-0 scroll-mt-24 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      {/* Floated so the legend sits inside the card instead of on its border. */}
      <legend className="float-left mb-4 w-full">
        <span className="block text-base font-semibold">{title}</span>
        {description && <span className="block text-sm text-ink-muted">{description}</span>}
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

/** Mother, Father, Grandparent as chips; Other opens a text field for anything else ("Legal guardian", "Tita"). */
function RelationshipField({ index }: { index: number }) {
  const { control } = useFormContext<PatientFormDraft>();
  const name = `guardians.${index}.relationship` as const;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => <RelationshipChips name={name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
    />
  );
}

function RelationshipChips({ name, value, onChange, onBlur }: { name: string; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  const [other, setOther] = useState(relationshipChoice(value) === "Other");
  const choice = other ? "Other" : relationshipChoice(value);
  return (
    <FormField name={name} label="Relationship">
      {(props) => (
        <div className="space-y-2">
          <ChoiceChips
            {...props}
            aria-labelledby={`${props.id}-label`}
            options={[...RELATIONSHIPS, "Other"].map((r) => ({ value: r, label: r }))}
            value={choice}
            onChange={(r) => {
              setOther(r === "Other");
              onChange(r === "Other" ? (relationshipChoice(value) === "Other" ? value : "") : r);
            }}
          />
          {other && <Input aria-label="Relationship, in your words" placeholder="e.g. Legal guardian" value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />}
        </div>
      )}
    </FormField>
  );
}

/** A yes/no medical question ("None known" or "Has some"); "Has some" opens the lists to fill. */
function MedicalAnswer({
  answer,
  label,
  some,
  lists,
}: {
  answer: "noKnownAllergies" | "noKnownConditions";
  label: string;
  some: string;
  lists: readonly (readonly ["allergies" | "medicalConditions" | "medications", string, string])[];
}) {
  const { control, setValue } = useFormContext<PatientFormDraft>();
  const value = useWatch({ control, name: answer });
  return (
    <div className="space-y-3">
      <FormField name={answer} label={label}>
        {(props) => (
          <ChoiceChips
            {...props}
            aria-labelledby={`${props.id}-label`}
            options={[
              { value: "none", label: "None known" },
              { value: "some", label: some },
            ]}
            value={value === true ? "none" : value === false ? "some" : ""}
            onChange={(v) => {
              setValue(answer, v === "none", { shouldDirty: true, shouldValidate: true });
              if (v === "none") lists.forEach(([list]) => setValue(list, [], { shouldDirty: true, shouldValidate: true }));
            }}
          />
        )}
      </FormField>
      {value === false &&
        lists.map(([list, listLabel, placeholder]) => (
          <FormField key={list} name={list} label={listLabel} hint={lists.length > 1 ? "Fill in at least one" : undefined}>
            {(props) => (
              <Controller
                control={control}
                name={list}
                render={({ field }) => <TagInput {...props} value={field.value} onChange={field.onChange} placeholder={placeholder} />}
              />
            )}
          </FormField>
        ))}
    </div>
  );
}

export function PatientForm({
  defaultValues = EMPTY_PATIENT,
  submitLabel,
  pending,
  cancelHref,
  onSubmit,
  onSubmitAndBook,
  intake = false,
  onValuesChange,
  onDiscard,
  restored = false,
  hideContacts = false,
}: {
  defaultValues?: PatientFormDraft;
  submitLabel: string;
  pending: boolean;
  cancelHref: string;
  onSubmit: (input: PatientFormValues) => void;
  /** Shows "Save and book appointment": registering usually ends in a booking. */
  onSubmitAndBook?: (input: PatientFormValues) => void;
  /** A new registration: shows the progress rail and the live duplicate check. */
  intake?: boolean;
  /** Called on every change, e.g. to keep a draft. */
  onValuesChange?: (values: PatientFormDraft) => void;
  /** Throws the draft away. When set, Cancel on a form with something typed asks first, and closing the tab warns. */
  onDiscard?: () => void;
  /** The form opened on a kept draft: Cancel asks before throwing it away even if nothing changed since. */
  restored?: boolean;
  /**
   * Editing without patients.contact (a dentist): the API never sent guardian phones, emails, the emergency contact
   * or the address, so none are shown and none are sent. The server keeps the stored ones (EditPatientWithoutContactsInput).
   */
  hideContacts?: boolean;
}) {
  // Both schemas' outputs fit PatientFormValues; the cast is only because Resolver is invariant in its values type.
  const resolver = zodResolver((hideContacts ? EditPatientWithoutContactsInput : CreatePatientInput).superRefine(intakeRules, INTAKE_ALWAYS)) as unknown as Resolver<
    PatientFormDraft,
    unknown,
    PatientFormValues
  >;
  const form = useForm<PatientFormDraft, unknown, PatientFormValues>({ resolver, defaultValues: withMedicalAnswers(defaultValues) });
  const { register, control, setValue, getValues } = form;
  const guardians = useFieldArray({ control, name: "guardians" });
  const guardiansError: string | undefined =
    get(form.formState.errors, "guardians")?.message ?? get(form.formState.errors, "guardians.root")?.message;

  const router = useRouter();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const typed = form.formState.isDirty || restored;

  useEffect(() => {
    if (!onValuesChange) return;
    const sub = form.watch((v) => onValuesChange(v as PatientFormDraft));
    return () => sub.unsubscribe();
  }, [form, onValuesChange]);

  // Closing the tab loses the draft (it lives in this tab only), so the browser asks first.
  useEffect(() => {
    if (!onDiscard || !form.formState.isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [onDiscard, form.formState.isDirty]);

  // The first guardian usually shares the child's surname: offer it, until someone types a name of their own.
  const [lastName, birthDate, guardianName] = useWatch({ control, name: ["lastName", "birthDate", "guardians.0.fullName"] });
  const surname = useRef(lastName);
  useEffect(() => {
    const current = getValues("guardians.0.fullName")?.trim() ?? "";
    // Only a real change: a no-op setValue would still notify watchers (and autosave an untouched form).
    if ((current === "" || current === surname.current.trim()) && current !== lastName.trim()) setValue("guardians.0.fullName", lastName.trim());
    surname.current = lastName;
  }, [lastName, getValues, setValue]);
  const onlySurname = !!lastName.trim() && guardianName?.trim() === lastName.trim();

  function makePrimary(index: number) {
    getValues("guardians").forEach((_, i) => setValue(`guardians.${i}.isPrimary`, i === index));
  }

  // Defaults to "same as the primary guardian" unless a separate emergency contact was already saved.
  const [sameAsGuardian, setSameAsGuardian] = useState(!defaultValues.emergencyContact?.name && !defaultValues.emergencyContact?.phone);

  const primaryBox = (index: number, id: string) => {
    return (
      <Controller
        control={control}
        name={`guardians.${index}.isPrimary`}
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Checkbox id={`guardian-${id}-primary`} checked={field.value} onCheckedChange={(checked) => (checked ? makePrimary(index) : field.onChange(false))} />
            <Label htmlFor={`guardian-${id}-primary`}>Primary contact</Label>
          </div>
        )}
      />
    );
  };

  const otherGuardians = guardians.fields.slice(1).map((g, j) => {
    const i = j + 1;
    return (
      <div key={g.id} className="space-y-4 border-t border-line pt-4">
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
              <FormField name={`guardians.${i}.email`} label="Email" optional>
                <Input type="email" {...register(`guardians.${i}.email`, { setValueAs: blankToUndefined })} />
              </FormField>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          {primaryBox(i, g.id)}
          <Button type="button" variant="ghost" size="sm" onClick={() => guardians.remove(i)}>
            <Trash2Icon /> Remove guardian
          </Button>
        </div>
      </div>
    );
  });

  return (
    <FormProvider {...form}>
      <div className={cn(intake && "lg:grid lg:grid-cols-[minmax(0,48rem)_16rem] lg:items-start lg:gap-6")}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="max-w-3xl min-w-0 space-y-5">
          {intake && <IntakeProgress variant="pills" contacts={!hideContacts} />}
          <Section id="intake-child" title="Child">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name="firstName" label="First name">
                <Input autoComplete="off" {...register("firstName")} />
              </FormField>
              <FormField name="lastName" label="Last name">
                <Input autoComplete="off" {...register("lastName")} />
              </FormField>
            </div>
            <FormField name="nickname" label="Nickname" optional>
              <Input autoComplete="off" placeholder="What the child likes to be called" {...register("nickname")} />
            </FormField>
            <FormField name="birthDate" label="Date of birth" hint={ageHint(birthDate)}>
              <Input type="date" className="sm:w-48" {...register("birthDate")} />
            </FormField>
            <FormField name="sex" label="Sex">
              {(props) => (
                <Controller
                  control={control}
                  name="sex"
                  render={({ field }) => (
                    <ChoiceChips
                      {...props}
                      aria-labelledby={`${props.id}-label`}
                      options={[
                        { value: "female", label: "Female" },
                        { value: "male", label: "Male" },
                      ]}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </FormField>
          </Section>

          <Section id="intake-guardian" title="Guardian" description="The primary contact gets reminders and signs consents.">
            <RelationshipField index={0} />
            <FormField name="guardians.0.fullName" label="Full name" hint={onlySurname ? "Surname copied from the child. Add the first name." : undefined}>
              <Input
                autoComplete="off"
                {...register("guardians.0.fullName", {
                  // A full name pasted or filled at the caret (before the copied surname) would read "Rosa Cruz Cruz".
                  onChange: (e) => {
                    const s = lastName.trim();
                    const v: string = e.target.value;
                    if (s && v.trim().toLowerCase().endsWith(`${s} ${s}`.toLowerCase())) setValue("guardians.0.fullName", v.trim().slice(0, -(s.length + 1)));
                  },
                })}
                onFocus={(e) => {
                  // Put the caret before the copied surname, so typing the first name reads "Maria Dela Rosa".
                  if (!onlySurname) return;
                  const input = e.currentTarget;
                  setValue("guardians.0.fullName", ` ${lastName.trim()}`);
                  requestAnimationFrame(() => input.setSelectionRange(0, 0));
                }}
              />
            </FormField>
            {!hideContacts && (
              <FormField name="guardians.0.phone" label="Mobile number" hint="Reminders go to this number">
                {(props) => (
                  <Controller
                    control={control}
                    name="guardians.0.phone"
                    render={({ field }) => (
                      <div className="flex sm:w-72">
                        <span aria-hidden className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-ground px-3 text-sm font-semibold">
                          +63
                        </span>
                        <Input
                          {...props}
                          type="tel"
                          inputMode="tel"
                          autoComplete="off"
                          placeholder="917 123 4567"
                          className="rounded-l-none"
                          value={phoneAfterPrefix(field.value ?? "")}
                          onChange={(e) => field.onChange(storedPhone(e.target.value))}
                          onBlur={field.onBlur}
                        />
                      </div>
                    )}
                  />
                )}
              </FormField>
            )}
            {guardians.fields.length > 1 && primaryBox(0, guardians.fields[0].id)}
            {otherGuardians}
            {guardiansError && <p className="text-sm text-danger">{guardiansError}</p>}
            {hideContacts ? (
              <p className="text-sm text-ink-muted">Phone numbers, new guardians and the emergency contact are handled by front desk and admin.</p>
            ) : (
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => guardians.append(newGuardian(false))}>
                <PlusIcon /> Add another guardian
              </Button>
            )}
          </Section>

          <Section id="intake-medical" title="Medical alerts" description="Shown on every patient screen. Ask, even if the answer is none." className="border-alert-line">
            <MedicalAnswer answer="noKnownAllergies" label="Allergies" some="Has allergies" lists={[["allergies", "Allergies", "e.g. Penicillin"]]} />
            <MedicalAnswer
              answer="noKnownConditions"
              label="Conditions or medications"
              some="Has some"
              lists={[
                ["medicalConditions", "Medical conditions", "e.g. Asthma"],
                ["medications", "Current medications", "e.g. Salbutamol inhaler"],
              ]}
            />
            <FormField name="alerts" label="Chairside alerts" optional>
              {(props) => (
                <Controller
                  control={control}
                  name="alerts"
                  render={({ field }) => <TagInput {...props} value={field.value} onChange={field.onChange} placeholder="e.g. Strong gag reflex" />}
                />
              )}
            </FormField>
          </Section>

          <div className="space-y-3 pt-2">
            <h2 className="text-base font-semibold">
              Add now or later <span className="font-normal text-ink-muted">· all optional</span>
            </h2>

            {!hideContacts && (
              <OptionalSection
                title="Contact and address"
                fields={["guardians.0.email", "address", "emergencyContact.name", "emergencyContact.phone"]}
              >
                <FormField name="guardians.0.email" label="Guardian's email" optional>
                  <Input type="email" {...register("guardians.0.email", { setValueAs: blankToUndefined })} />
                </FormField>
                <FormField name="address" label="Home address" optional>
                  <Input autoComplete="street-address" placeholder="House no., street, barangay, city" {...register("address")} />
                </FormField>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="emergency-same"
                    checked={sameAsGuardian}
                    onCheckedChange={(checked) => {
                      setSameAsGuardian(!!checked);
                      // Never copied: a copy would go stale when the guardian's phone changes through Quick update.
                      if (checked) setValue("emergencyContact", { name: "", phone: "" }, { shouldDirty: true });
                    }}
                  />
                  <Label htmlFor="emergency-same">Emergency contact is the primary guardian</Label>
                </div>
                {!sameAsGuardian && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField name="emergencyContact.name" label="Emergency contact name">
                      <Input {...register("emergencyContact.name")} />
                    </FormField>
                    <FormField name="emergencyContact.phone" label="Emergency contact phone">
                      <Input type="tel" inputMode="tel" autoComplete="off" {...register("emergencyContact.phone")} />
                    </FormField>
                  </div>
                )}
              </OptionalSection>
            )}

            <OptionalSection title="Background" fields={["profile.school", "profile.referredBy", "tags"]}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="profile.school" label="School" optional>
                  <Input autoComplete="off" {...register("profile.school")} />
                </FormField>
                <FormField name="profile.referredBy" label="Referred by" optional>
                  <Input autoComplete="off" placeholder="e.g. Dr. Ramos, a friend, Facebook" {...register("profile.referredBy")} />
                </FormField>
              </div>
              <FormField name="tags" label="Tags" optional>
                {(props) => (
                  <Controller
                    control={control}
                    name="tags"
                    render={({ field }) => (
                      <TagInput
                        {...props}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        placeholder="e.g. Anxious"
                        reject={reservedTagReason}
                        suggestions={TAG_SUGGESTIONS}
                      />
                    )}
                  />
                )}
              </FormField>
            </OptionalSection>

            <OptionalSection title="More medical" fields={["profile.bloodType", "profile.hmo", "profile.familyDoctor"]}>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField name="profile.bloodType" label="Blood type" optional>
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
                <FormField name="profile.hmo" label="HMO / insurance" optional>
                  <Input autoComplete="off" placeholder="Provider and member number" {...register("profile.hmo")} />
                </FormField>
                <FormField name="profile.familyDoctor" label="Family doctor" optional>
                  <Input autoComplete="off" {...register("profile.familyDoctor")} />
                </FormField>
              </div>
            </OptionalSection>

            <OptionalSection
              title="Dental history"
              fields={["dentalHistory.previousClinic", "dentalHistory.notes", ...DENTAL_PROFILE.map(([name]) => name)]}
            >
              <FormField name="dentalHistory.previousClinic" label="Previous clinic" optional>
                <Input {...register("dentalHistory.previousClinic")} />
              </FormField>
              <FormField name="dentalHistory.notes" label="Notes" optional>
                <Textarea rows={3} {...register("dentalHistory.notes")} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                {DENTAL_PROFILE.map(([name, label, placeholder]) => (
                  <FormField key={name} name={name} label={label} optional>
                    <Textarea rows={2} placeholder={placeholder} {...register(name)} />
                  </FormField>
                ))}
              </div>
            </OptionalSection>
          </div>

          {/* Pinned to the bottom so saving never needs a scroll back down a long form. */}
          <div className="sticky bottom-(--bottom-nav-h) z-(--z-sticky) -mx-4 flex items-center justify-end gap-2 border-t border-line bg-ground/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
            {onDiscard && typed ? (
              <Button type="button" variant="ghost" className="mr-auto" onClick={() => setConfirmDiscard(true)}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost" className="mr-auto">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            )}
            {onSubmitAndBook && (
              <Button type="button" variant="outline" disabled={pending} onClick={form.handleSubmit(onSubmitAndBook)}>
                <span>
                  Save and book<span className="max-md:hidden"> appointment</span>
                </span>
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving" : submitLabel}
            </Button>
          </div>
        </form>
        {intake && <IntakeProgress variant="rail" contacts={!hideContacts} />}
      </div>
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent size="confirm">
          <DialogHeader>
            <DialogTitle>Discard this new patient?</DialogTitle>
            <DialogDescription>What you typed is deleted from this computer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDiscard?.();
                router.push(cancelHref);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormProvider>
  );
}
