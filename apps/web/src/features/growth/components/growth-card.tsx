"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  OralHabit,
  SaveGrowthInput,
  deriveChart,
  dentitionStage,
  habitTimeline,
  type GrowthRecord,
  type Patient,
  type Visit,
} from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/features/auth/access";
import { useChartEntries } from "@/features/chart/api";
import { formatAge } from "@/features/patients/age";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useGrowth, useSaveGrowth } from "../api";

const HABIT_LABEL: Record<OralHabit, string> = {
  thumb_sucking: "Thumb sucking",
  pacifier: "Pacifier use",
  mouth_breathing: "Mouth breathing",
  bruxism: "Bruxism",
};
const STAGE_LABEL = { primary: "Primary dentition", mixed: "Mixed dentition", permanent: "Permanent dentition" };
const day = (d: string) => format(parseISO(d), "MMM d, yyyy");

export function GrowthCard({ patient }: { patient: Patient }) {
  const { data: records = [], isLoading, error } = useGrowth(patient.id);
  const visits = useVisits(patient.id).data ?? [];
  const current = useCurrentVisit(patient.id);
  const canWrite = useCan()("clinical.write");
  const stage = dentitionStage(deriveChart(useChartEntries(patient.id).data ?? []));
  const habits = habitTimeline(records);
  const visitOf = (id: string) => visits.find((v) => v.id === id);

  return (
    <section className="space-y-4 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Growth and development</h2>
        {current && canWrite && (
          <GrowthDialog patient={patient} visit={current} records={records} existing={records.find((r) => r.visitId === current.id)} />
        )}
      </div>

      <div className="text-sm">
        <p className="font-medium">
          {stage.stage ? STAGE_LABEL[stage.stage] : "Dentition stage not charted yet"}
          <span className="font-normal text-ink-muted"> · from the chart</span>
        </p>
        {(
          [
            ["Erupting", stage.erupting],
            ["Unerupted", stage.unerupted],
            ["Primary teeth lost", stage.primaryLost],
          ] as const
        ).map(([label, teeth]) =>
          teeth.length > 0 && (
            <p key={label}>
              <span className="text-ink-muted">{label}:</span> {teeth.join(", ")}
            </p>
          ),
        )}
      </div>

      {isLoading && <p className="text-ink-muted">Loading…</p>}
      {error && <p className="text-danger">Couldn&apos;t load growth records.</p>}
      {!isLoading && records.length === 0 && <p className="text-ink-muted">No habits or speech observations recorded.</p>}

      {habits.length > 0 && (
        <ul aria-label="Oral habits" className="divide-y divide-line">
          {habits.map((h) => (
            <li key={h.habit} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium">{HABIT_LABEL[h.habit]}</span>
              <span className="text-sm">
                {h.startedOn ? `since ${day(h.startedOn)}` : "start unknown"}
                {h.stoppedOn && ` → stopped ${day(h.stoppedOn)}`}
                <Badge variant={h.stoppedOn ? "outline" : "default"} className="ml-2">
                  {h.stoppedOn ? "Stopped" : "Ongoing"}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {records.length > 0 && (
        <ol aria-label="Growth timeline" className="space-y-3 border-l-2 border-line pl-4">
          {[...records].reverse().map((r) => {
            const v = visitOf(r.visitId);
            return (
              <li key={r.id} className="text-sm">
                <p className="font-medium">
                  {v ? day(v.date) : "Unknown visit"}
                  {v && <span className="font-normal text-ink-muted"> · age {formatAge(patient.birthDate, parseISO(v.date))}</span>}
                </p>
                {r.habits.map((h) => (
                  <p key={h.habit}>
                    {HABIT_LABEL[h.habit]}: {h.stoppedOn ? `stopped ${day(h.stoppedOn)}` : "ongoing"}
                  </p>
                ))}
                {r.speech && <p><span className="text-ink-muted">Speech:</span> {r.speech}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

type Row = { habit: OralHabit; on: boolean; startedOn: string; stoppedOn: string };
type GrowthProps = { patient: Patient; visit: Visit; records: GrowthRecord[]; existing?: GrowthRecord };

function GrowthDialog(props: GrowthProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{props.existing ? "Edit for this visit" : "Record for this visit"}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Growth and development</DialogTitle>
          <DialogDescription>Check each habit seen. Add a stop date when the parent says it has stopped.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so it starts from the latest records each time. */}
        <GrowthForm {...props} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function GrowthForm({ patient, visit, records, existing, onSaved }: GrowthProps & { onSaved: () => void }) {
  const save = useSaveGrowth(patient.id);
  const [errors, setErrors] = useState<Partial<Record<OralHabit, string>>>({});
  // Start from this visit's record, else carry forward what earlier visits recorded.
  const known = existing?.habits ?? habitTimeline(records);
  const form = useForm({
    defaultValues: {
      rows: OralHabit.options.map((habit): Row => {
        const h = known.find((k) => k.habit === habit);
        return { habit, on: !!h, startedOn: h?.startedOn ?? "", stoppedOn: h?.stoppedOn ?? "" };
      }),
      speech: existing?.speech ?? "",
    },
  });
  const rows = form.watch("rows");
  const today = format(new Date(), "yyyy-MM-dd");

  function onSubmit({ rows, speech }: { rows: Row[]; speech: string }) {
    const checked = rows.filter((r) => r.on);
    const parsed = SaveGrowthInput.safeParse({
      habits: checked.map((r) => ({ habit: r.habit, startedOn: r.startedOn || undefined, stoppedOn: r.stoppedOn || undefined })),
      speech: speech.trim() || undefined,
    });
    // Issues point at habits[i]; show each under its habit's row.
    setErrors(
      parsed.success
        ? {}
        : Object.fromEntries(parsed.error.issues.map((i) => [checked[Number(i.path[1])]?.habit, i.message])),
    );
    if (!parsed.success) return;
    save.mutate(
      { visitId: visit.id, input: parsed.data },
      {
        onSuccess: () => {
          toast.success("Growth and development saved");
          onSaved();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
      {rows.map((r, i) => (
        <fieldset key={r.habit} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_9rem]">
          <Label className="font-normal sm:pb-2">
            <Checkbox checked={r.on} onCheckedChange={(on) => form.setValue(`rows.${i}.on`, on === true)} />
            {HABIT_LABEL[r.habit]}
          </Label>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${r.habit}-start`} className="text-xs text-ink-muted">Started</Label>
            <Input id={`${r.habit}-start`} type="date" max={today} disabled={!r.on} {...form.register(`rows.${i}.startedOn`)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${r.habit}-stop`} className="text-xs text-ink-muted">Stopped</Label>
            <Input id={`${r.habit}-stop`} type="date" max={today} disabled={!r.on} {...form.register(`rows.${i}.stoppedOn`)} />
          </div>
          {errors[r.habit] && <p className="text-sm text-danger sm:col-span-3">{errors[r.habit]}</p>}
        </fieldset>
      ))}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="growth-speech">Speech observations</Label>
        <Textarea id="growth-speech" rows={2} {...form.register("speech")} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </form>
  );
}
