"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Controller, FormProvider, useForm, useFormContext, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  BehaviorRating,
  noteValuesSchema,
  type ClinicalNote,
  type NoteTemplate,
  type Patient,
  type TemplateField,
  type Visit,
} from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToothPicker } from "@/features/chart/components/tooth-picker";
import { useNoteTemplates, useSaveNote, useSignNote } from "../api";

export const BEHAVIOR_LABEL: Record<BehaviorRating, string> = {
  cooperative: "Cooperative",
  anxious: "Anxious",
  fearful: "Fearful",
  crying: "Crying",
  resistant: "Resistant",
  needs_parent: "Needs parental presence",
  needs_guidance: "Requires behavior guidance",
};

type NoteForm = { values: Record<string, unknown>; behavior: BehaviorRating[]; behaviorNote?: string };

/** New note (pass `visit`) or edit a draft (pass `note`). Signed notes never open here. */
export function NoteDialog({
  patient,
  visit,
  note,
  trigger,
}: {
  patient: Patient;
  visit?: Visit;
  note?: ClinicalNote;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const templates = useNoteTemplates();
  const [templateId, setTemplateId] = useState(note?.templateId);
  const template = templates.data?.find((t) => t.id === templateId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && !note) setTemplateId(undefined);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{note ? `Edit ${template?.name ?? "note"}` : "New note"}</DialogTitle>
          <DialogDescription>Save a draft to finish later. Signing locks the note for good.</DialogDescription>
        </DialogHeader>
        {!note && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note-template">Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="note-template" className="w-full">
                <SelectValue placeholder="Choose a procedure" />
              </SelectTrigger>
              <SelectContent>
                {templates.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {template && (
          <NoteFields
            key={template.id}
            patient={patient}
            template={template}
            visit={visit}
            note={note}
            onDone={() => {
              setOpen(false);
              if (!note) setTemplateId(undefined);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function blankValue(f: TemplateField) {
  return f.type === "checkbox" ? false : f.type === "teeth" ? [] : f.type === "text" ? "" : undefined;
}

function NoteFields({
  patient,
  template,
  visit,
  note,
  onDone,
}: {
  patient: Patient;
  template: NoteTemplate;
  visit?: Visit;
  note?: ClinicalNote;
  onDone: () => void;
}) {
  const save = useSaveNote(patient.id);
  const sign = useSignNote(patient.id);
  const schema = useMemo(
    () => z.object({ values: noteValuesSchema(template), behavior: z.array(BehaviorRating), behaviorNote: z.string().optional() }),
    [template],
  );
  const form = useForm<NoteForm>({
    resolver: zodResolver(schema) as Resolver<NoteForm>,
    defaultValues: {
      values: Object.fromEntries(template.fields.map((f) => [f.key, note?.values[f.key] ?? blankValue(f)])),
      behavior: note?.behavior ?? [],
      behaviorNote: note?.behaviorNote ?? "",
    },
  });

  async function submit(input: NoteForm, andSign: boolean) {
    const body = { ...input, behaviorNote: input.behaviorNote?.trim() || undefined };
    try {
      const saved = await save.mutateAsync(
        note ? { noteId: note.id, input: body } : { input: { ...body, visitId: visit!.id, templateId: template.id } },
      );
      if (andSign) await sign.mutateAsync(saved.id);
      toast.success(andSign ? `${template.name} note signed` : "Draft saved");
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const busy = save.isPending || sign.isPending;
  return (
    <FormProvider {...form}>
      <form noValidate className="min-w-0 space-y-4" onSubmit={form.handleSubmit((v) => submit(v, false))}>
        {template.fields.map((f) => (
          <TemplateInput key={f.key} field={f} patient={patient} />
        ))}

        <Controller
          control={form.control}
          name="behavior"
          render={({ field }) => (
            <fieldset className="space-y-2 border-t border-line pt-4">
              <legend className="pt-4 font-medium">Child behavior</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {BehaviorRating.options.map((b) => (
                  <Label key={b} className="font-normal">
                    <Checkbox
                      checked={field.value.includes(b)}
                      onCheckedChange={(on) => field.onChange(on ? [...field.value, b] : field.value.filter((x) => x !== b))}
                    />
                    {BEHAVIOR_LABEL[b]}
                  </Label>
                ))}
              </div>
            </fieldset>
          )}
        />
        <FormField name="behaviorNote" label="Behavior note (optional)">
          <Input {...form.register("behaviorNote")} />
        </FormField>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="submit" variant="outline" disabled={busy}>
            Save draft
          </Button>
          <Button type="button" disabled={busy} onClick={form.handleSubmit((v) => submit(v, true))}>
            {busy ? "Saving…" : "Save and sign"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

/** One input per template field type. Adding a template needs no code; adding a field type does. */
function TemplateInput({ field: f, patient }: { field: TemplateField; patient: Patient }) {
  const { control, register } = useFormContext<NoteForm>();
  const name = `values.${f.key}` as const;
  const label = f.required ? `${f.label} *` : f.label;

  switch (f.type) {
    case "text":
      return (
        <FormField name={name} label={label}>
          {f.multiline ? <Textarea rows={2} {...register(name)} /> : <Input {...register(name)} />}
        </FormField>
      );
    case "select":
      return (
        <FormField name={name} label={label}>
          {(props) => (
            <Controller
              control={control}
              name={name}
              render={({ field }) => (
                <Select value={(field.value as string | undefined) ?? ""} onValueChange={field.onChange}>
                  <SelectTrigger {...props} className="w-full">
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>
      );
    case "checkbox":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Label className="font-normal">
              <Checkbox checked={field.value === true} onCheckedChange={(on) => field.onChange(on === true)} />
              {f.label}
            </Label>
          )}
        />
      );
    case "teeth":
      return (
        <Controller
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            // min-w-0: a fieldset otherwise grows to fit the chart, widening the whole dialog on a phone.
            <fieldset className="min-w-0 space-y-2">
              <legend className="text-sm font-medium">{label}</legend>
              <ToothPicker patient={patient} value={(field.value as number[]) ?? []} onChange={field.onChange} />
              {fieldState.error && <p className="text-sm text-danger">{fieldState.error.message}</p>}
            </fieldset>
          )}
        />
      );
  }
}
