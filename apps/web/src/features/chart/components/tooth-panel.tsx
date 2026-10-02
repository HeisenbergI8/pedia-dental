"use client";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  CreateChartEntryInput,
  ToothCondition,
  WHOLE_TOOTH_CONDITIONS,
  isToothGone,
  surfacesFor,
  type ChartEntry,
  type Surface,
  type ToothNumber,
  type ToothState,
  type Visit,
} from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useStaff } from "@/features/clinic/api";
import { AddToPlan } from "@/features/plan/components/add-to-plan";
import { cn } from "@/lib/utils";
import { useRecordChartEntry } from "../api";
import { CONDITION_STYLE, describeTooth } from "./tooth";

const SURFACE_LABEL: Record<Surface, string> = {
  M: "Mesial",
  O: "Occlusal",
  I: "Incisal",
  D: "Distal",
  B: "Buccal",
  L: "Lingual",
};

const surfaceText = (e: Pick<ChartEntry, "surfaces">) => (e.surfaces.length ? e.surfaces.join("") : "Whole tooth");

export function ToothPanel({
  patientId,
  tooth,
  surface,
  state,
  visits,
  recordingVisit,
  historical,
  onClose,
}: {
  patientId: string;
  tooth: ToothNumber;
  /** The zone that was clicked, pre-checked in the form. */
  surface?: Surface;
  state?: ToothState;
  visits: Visit[];
  /** The visit new findings go to. Unset when no visit is open or a past chart is shown: read-only. */
  recordingVisit?: Visit;
  /** A past chart ("as of visit") is shown: nothing can be added from it, not even plan items. */
  historical: boolean;
  onClose: () => void;
}) {
  const [correcting, setCorrecting] = useState<ChartEntry>();
  const history = [...(state?.history ?? [])].reverse();
  const correctedIds = new Set(history.map((e) => e.supersedes).filter(Boolean));
  const visitDate = (id: string) => {
    const v = visits.find((x) => x.id === id);
    return v ? format(parseISO(v.date), "MMM d, yyyy") : "Unknown visit";
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tooth {tooth}</SheetTitle>
          <SheetDescription>{describeTooth(tooth, state).replace(/^Tooth \d+: /, "Now: ")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-6">
          {recordingVisit && isToothGone(state) && !correcting ? (
            <p className="rounded-md bg-ground px-3 py-2 text-sm text-ink-muted">
              This tooth is recorded as {state?.whole}. If that was a mistake, correct the entry in History.
            </p>
          ) : recordingVisit ? (
            <EntryForm
              // Remount when switching between a new finding and a correction, so defaults apply.
              key={correcting?.id ?? "new"}
              patientId={patientId}
              tooth={tooth}
              surface={surface}
              visit={recordingVisit}
              correcting={correcting}
              onCancelCorrection={() => setCorrecting(undefined)}
              onSaved={() => setCorrecting(undefined)}
            />
          ) : (
            <p className="rounded-md bg-ground px-3 py-2 text-sm text-ink-muted">
              Read-only. Start a visit and show the latest chart to record findings.
            </p>
          )}

          {!historical && !isToothGone(state) && <AddToPlan patientId={patientId} tooth={tooth} state={state} />}

          <section className="space-y-2">
            <h3 className="font-semibold">History</h3>
            {history.length === 0 && <p className="text-sm text-ink-muted">No findings recorded for this tooth.</p>}
            <ol className="divide-y divide-line">
              {history.map((e) => {
                const corrected = correctedIds.has(e.id);
                return (
                  <li key={e.id} className="space-y-1 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("font-medium", corrected && "text-ink-muted line-through")}>
                        {CONDITION_STYLE[e.condition].label} · {surfaceText(e)}
                      </p>
                      {recordingVisit && !corrected && (
                        <Button size="sm" variant="ghost" onClick={() => setCorrecting(e)}>
                          Correct
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted">
                      {visitDate(e.visitId)}
                      {corrected && <Badge variant="outline" className="ml-2">Corrected</Badge>}
                      {e.supersedes && <Badge variant="secondary" className="ml-2">Correction</Badge>}
                    </p>
                    {e.note && <p className="text-sm whitespace-pre-line">{e.note}</p>}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EntryForm({
  patientId,
  tooth,
  surface,
  visit,
  correcting,
  onCancelCorrection,
  onSaved,
}: {
  patientId: string;
  tooth: ToothNumber;
  surface?: Surface;
  visit: Visit;
  correcting?: ChartEntry;
  onCancelCorrection: () => void;
  onSaved: () => void;
}) {
  const record = useRecordChartEntry(patientId);
  const staff = useStaff();
  const dentist = staff.data?.find((s) => s.id === visit.dentistId)?.fullName;
  const blank: CreateChartEntryInput = {
    visitId: visit.id,
    tooth,
    surfaces: surface ? [surface] : [],
    condition: "caries",
    note: "",
  };
  const form = useForm<CreateChartEntryInput>({
    resolver: zodResolver(CreateChartEntryInput),
    defaultValues: correcting
      ? { ...blank, surfaces: correcting.surfaces, condition: correcting.condition, supersedes: correcting.id }
      : blank,
  });
  const wholeOnly = WHOLE_TOOTH_CONDITIONS.includes(form.watch("condition"));

  function onSubmit(input: CreateChartEntryInput) {
    record.mutate(
      { ...input, note: input.note?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(correcting ? "Correction saved" : `Finding saved on tooth ${tooth}`);
          form.reset(blank);
          onSaved();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        {correcting ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-alert-bg px-3 py-2 text-sm text-alert">
            <span>
              Correcting {CONDITION_STYLE[correcting.condition].label.toLowerCase()} · {surfaceText(correcting)}. The
              original stays in history.
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={onCancelCorrection}>
              Cancel
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">New finding for this visit{dentist && ` with ${dentist}`}.</p>
        )}

        <FormField name="condition" label="Condition">
          {(props) => (
            <Controller
              control={form.control}
              name="condition"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v: ToothCondition) => {
                    field.onChange(v);
                    if (WHOLE_TOOTH_CONDITIONS.includes(v)) form.setValue("surfaces", []);
                  }}
                >
                  <SelectTrigger {...props} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ToothCondition.options.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CONDITION_STYLE[c].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>

        <Controller
          control={form.control}
          name="surfaces"
          render={({ field, fieldState }) => (
            <fieldset className="space-y-2" disabled={wholeOnly}>
              <legend className="text-sm font-medium">Surfaces</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {surfacesFor(tooth).map((s) => (
                  <Label key={s} className="font-normal">
                    <Checkbox
                      checked={field.value.includes(s)}
                      onCheckedChange={(on) =>
                        field.onChange(on ? [...field.value, s] : field.value.filter((x) => x !== s))
                      }
                    />
                    {SURFACE_LABEL[s]} ({s})
                  </Label>
                ))}
              </div>
              <p className="text-sm text-ink-muted">
                {wholeOnly ? "This condition applies to the whole tooth." : "None checked = the whole tooth."}
              </p>
              {fieldState.error && <p className="text-sm text-danger">{fieldState.error.message}</p>}
            </fieldset>
          )}
        />

        <FormField name="note" label="Note (optional)">
          <Textarea rows={2} {...form.register("note")} />
        </FormField>

        <Button type="submit" disabled={record.isPending}>
          {record.isPending ? "Saving…" : correcting ? "Save correction" : "Save finding"}
        </Button>
      </form>
    </FormProvider>
  );
}
