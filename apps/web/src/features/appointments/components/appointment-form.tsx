"use client";
import { useEffect } from "react";
import { Controller, FormProvider, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { IsoDate, type Appointment } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useChairs, useProcedures, useStaff } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { useBookAppointment, useRescheduleAppointment } from "../api";

const FormValues = z.object({
  patientId: z.string().min(1, "Pick a patient"),
  reason: z.string().trim().min(1, "Give a reason"),
  dentistId: z.string().min(1, "Pick a dentist"),
  chairId: z.string().min(1, "Pick a chair"),
  date: IsoDate,
  time: z.string().regex(/^\d{2}:\d{2}$/, "Pick a time"),
  durationMin: z.number({ error: "Enter minutes" }).int().positive("Enter minutes"),
  procedureCode: z.string().optional(), // set by the Procedure picker; the reason is the wording
});
type FormValues = z.infer<typeof FormValues>;

/** Where the form opens: a slot picked on the calendar, or an appointment being moved. */
export type AppointmentDraft = Partial<Pick<Appointment, "patientId" | "chairId" | "dentistId" | "reason" | "durationMin" | "sourceRuleId">> & {
  start?: Date;
  appointment?: Appointment;
};

function toValues({ appointment, start, ...rest }: AppointmentDraft): FormValues {
  const merged = { ...rest, ...appointment };
  const at = appointment ? new Date(appointment.startsAt) : (start ?? new Date());
  return {
    patientId: merged.patientId ?? "",
    reason: merged.reason ?? "",
    dentistId: merged.dentistId ?? "",
    chairId: merged.chairId ?? "",
    date: format(at, "yyyy-MM-dd"),
    time: format(at, "HH:mm"),
    durationMin: merged.durationMin ?? 30,
  };
}

function SelectField({ name, label, options }: { name: keyof FormValues; label: string; options: { value: string; label: string }[] }) {
  const { control } = useFormContext<FormValues>();
  return (
    <FormField name={name} label={label}>
      {(props) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Select value={String(field.value)} onValueChange={field.onChange}>
              <SelectTrigger {...props} className="w-full">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      )}
    </FormField>
  );
}

export function AppointmentForm({ draft, onClose }: { draft: AppointmentDraft | null; onClose: () => void }) {
  const patients = usePatients();
  const staff = useStaff();
  const chairs = useChairs();
  const procedures = useProcedures();
  const book = useBookAppointment();
  const reschedule = useRescheduleAppointment();
  const form = useForm<FormValues>({ resolver: zodResolver(FormValues), defaultValues: toValues({}) });
  const editing = draft?.appointment;
  const patientFixed = !!(editing ?? draft?.patientId);

  useEffect(() => {
    if (draft) form.reset(toValues(draft));
  }, [draft, form]);

  function onSubmit({ patientId, date, time, ...rest }: FormValues) {
    const input = { ...rest, startsAt: new Date(`${date}T${time}`).toISOString() };
    const onError = (e: Error) => toast.error(e.message); // e.g. a double-booking; the form stays open
    const saved = (message: string) => () => {
      toast.success(message);
      onClose();
    };
    // A move keeps what the visit is for: RescheduleAppointmentInput has no procedureCode, so the server ignores it.
    if (editing) reschedule.mutate({ id: editing.id, ...input }, { onSuccess: saved("Appointment moved"), onError });
    else book.mutate({ ...input, patientId, sourceRuleId: draft?.sourceRuleId }, { onSuccess: saved("Appointment booked"), onError });
  }

  const patientName = (id: string) => {
    const p = patients.data?.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : "";
  };
  const patientOptions = (patients.data ?? [])
    .map((p) => ({ value: p.id, label: patientName(p.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Reschedule appointment" : "New appointment"}</DialogTitle>
          <DialogDescription>
            {patientFixed ? patientName(form.watch("patientId")) : "A chair or dentist can't be double-booked."}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            {!patientFixed && <SelectField name="patientId" label="Patient" options={patientOptions} />}
            {!editing && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="appt-procedure">Procedure (fills reason and length)</Label>
                <Select
                  onValueChange={(code) => {
                    const p = procedures.data?.find((x) => x.code === code);
                    if (!p) return;
                    form.setValue("procedureCode", p.code);
                    form.setValue("reason", p.name, { shouldValidate: true });
                    form.setValue("durationMin", p.defaultDurationMin, { shouldValidate: true });
                  }}
                >
                  <SelectTrigger id="appt-procedure" className="w-full">
                    <SelectValue placeholder="Choose" />
                  </SelectTrigger>
                  <SelectContent>
                    {procedures.data?.map((p) => (
                      <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <FormField name="reason" label="Reason">
              <Input {...form.register("reason")} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                name="dentistId"
                label="Dentist"
                options={(staff.data ?? []).filter((s) => s.role === "dentist").map((s) => ({ value: s.id, label: s.fullName }))}
              />
              <SelectField name="chairId" label="Chair" options={(chairs.data ?? []).map((c) => ({ value: c.id, label: c.name }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField name="date" label="Date">
                <Input type="date" {...form.register("date")} />
              </FormField>
              <FormField name="time" label="Start">
                <Input type="time" step={900} {...form.register("time")} />
              </FormField>
              <FormField name="durationMin" label="Minutes">
                <Input type="number" min={5} step={5} {...form.register("durationMin", { valueAsNumber: true })} />
              </FormField>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={book.isPending || reschedule.isPending}>
                {editing ? "Move appointment" : "Book appointment"}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
