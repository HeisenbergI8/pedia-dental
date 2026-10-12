"use client";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format, isValid, parseISO, startOfDay } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { IsoDate, bookableStart, findFreeSlots, holdsRole, outsideClinicHours, type Appointment, type OpeningHours } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/features/auth/access";
import { useActiveBranch, useBranchChairs, useBranchStaff, useProcedures } from "@/features/clinic/api";
import { usePatient } from "@/features/patients/api";
import { useVisits } from "@/features/visits/api";
import { useAppointments, useBookAppointment, useRescheduleAppointment } from "../api";
import { bookLabel } from "../booking";
import { DentistPicker, PatientPicker, ProcedurePicker, SelectField, SlotPicker, TimeFields } from "./booking-pickers";

const FormValues = z
  .object({
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
export type BookingValues = FormValues;

/** The server's rule (outsideClinicHours), checked here too so the reason shows before anything is sent. */
const withinHours = (hours: OpeningHours | undefined) =>
  FormValues.superRefine((v, ctx) => {
    const why = hours && outsideClinicHours(new Date(`${v.date}T${v.time}`), v.durationMin, hours);
    if (why) ctx.addIssue({ code: "custom", message: why, path: ["time"] });
  });

/** Where the form opens: a slot picked on the calendar, or an appointment being moved. */
export type AppointmentDraft = Partial<Pick<Appointment, "patientId" | "chairId" | "dentistId" | "reason" | "durationMin" | "sourceRuleId" | "procedureCode">> & {
  start?: Date;
  appointment?: Appointment;
};

/** `myDentistId`: the signed-in dentist, the default when the draft names none. */
function toValues({ appointment, start, ...rest }: AppointmentDraft, hours: OpeningHours | undefined, myDentistId?: string): FormValues {
  const merged = { ...rest, ...appointment };
  const durationMin = merged.durationMin ?? 30;
  // A move keeps its time; a new booking opens on a bookable one (a calendar day arrives as 00:00).
  const at = appointment ? new Date(appointment.startsAt) : hours ? bookableStart(start, new Date(), hours, durationMin) : (start ?? new Date());
  return {
    patientId: merged.patientId ?? "",
    reason: merged.reason ?? "",
    dentistId: merged.dentistId ?? myDentistId ?? "",
    chairId: merged.chairId ?? "",
    date: format(at, "yyyy-MM-dd"),
    time: format(at, "HH:mm"),
    durationMin,
    procedureCode: merged.procedureCode,
  };
}

export function AppointmentForm({ draft, onClose }: { draft: AppointmentDraft | null; onClose: () => void }) {
  const router = useRouter();
  const me = useSession()?.user;
  const myDentistId = me?.roles.includes("dentist") ? me.staffId : undefined;
  const branchStaff = useBranchStaff();
  const chairs = useBranchChairs();
  const hours = useActiveBranch()?.openingHours;
  const resolver = useMemo(() => zodResolver(withinHours(hours)), [hours]);
  const procedures = useProcedures();
  const book = useBookAppointment();
  const reschedule = useRescheduleAppointment();
  const form = useForm<FormValues>({ resolver, defaultValues: toValues({}, hours) });
  const editing = draft?.appointment;
  const patientFixed = !!(editing ?? draft?.patientId);
  const dentists = branchStaff.filter((s) => holdsRole(s, "dentist")); // only dentists who work at this branch
  // Set by "Pick another date or time": from then on the user owns the time, and slots stop following the dentist.
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!draft) return;
    form.reset(toValues(draft, hours, myDentistId));
    setCustom(false);
  }, [draft, form, hours, myDentistId]);

  const [patientId, dentistId, durationMin, date, time] = form.watch(["patientId", "dentistId", "durationMin", "date", "time"]);
  const patient = usePatient(patientId).data;

  // No dentist from the draft or the session: the one who saw this child last, until the user picks one.
  const lastDentistId = useVisits(patientId).data?.[0]?.dentistId; // newest first
  useEffect(() => {
    if (!draft || draft.appointment || draft.dentistId || myDentistId || !lastDentistId) return;
    if (form.getFieldState("dentistId").isDirty) return;
    form.setValue("dentistId", lastDentistId);
  }, [draft, myDentistId, lastDentistId, form]);

  // Who is booked over the next two weeks: for open slots and to rank the patient search.
  // Strings from `today`, so the query key is stable across renders (as recall-list.tsx does).
  const today = format(new Date(), "yyyy-MM-dd");
  const booked = useAppointments(startOfDay(parseISO(today)).toISOString(), addDays(parseISO(today), 15).toISOString());
  const bookedIds = useMemo(
    () => [...new Set((booked.data ?? []).filter((a) => a.status !== "cancelled").sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((a) => a.patientId))],
    [booked.data],
  );

  // A draft's chair (a clicked calendar slot, a recall) goes first, then the rest in order.
  const chairKey = [draft?.chairId, ...(chairs.data ?? []).map((c) => c.id)].filter((c, i, a): c is string => !!c && a.indexOf(c) === i).join();
  const from = useMemo(
    () => (draft && !draft.appointment && hours ? bookableStart(draft.start, new Date(), hours, draft.durationMin ?? 30) : undefined),
    [draft, hours],
  );
  const slots = useMemo(
    () =>
      from && hours && dentistId && chairKey && booked.data && Number.isFinite(durationMin) && durationMin > 0
        ? findFreeSlots({ from, durationMin, dentistId, chairIds: chairKey.split(","), hours }, booked.data, 3)
        : [],
    [from, hours, dentistId, durationMin, chairKey, booked.data],
  );
  const noSlots = !!dentistId && !!booked.data && slots.length === 0;

  // Until the user takes the time into their own hands, it follows the first open slot (dentist or length changed).
  useEffect(() => {
    if (custom || editing || !slots[0]) return;
    form.setValue("date", format(slots[0].startsAt, "yyyy-MM-dd"));
    form.setValue("time", format(slots[0].startsAt, "HH:mm"));
    form.setValue("chairId", slots[0].chairId);
  }, [slots, custom, editing, form]);

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

  const when = new Date(`${date}T${time}`);
  const submitLabel = editing ? "Move appointment" : isValid(when) ? bookLabel(when) : "Book appointment";

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Reschedule appointment" : "New appointment"}</DialogTitle>
          <DialogDescription>
            {patientFixed && patient ? `${patient.lastName}, ${patient.firstName}` : "A chair or dentist can't be double-booked."}
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
            {editing ? (
              <>
                <FormField name="reason" label="Reason">
                  <Input {...form.register("reason")} />
                </FormField>
                <SelectField name="dentistId" label="Dentist" options={dentists.map((s) => ({ value: s.id, label: s.fullName }))} />
                <TimeFields chairs={chairs.data ?? []} />
              </>
            ) : (
              <>
                {!patientFixed && (
                  <PatientPicker
                    bookedIds={bookedIds}
                    onRegister={(q) => {
                      onClose();
                      router.push(`/patients/new?name=${encodeURIComponent(q)}`);
                    }}
                  />
                )}
                <ProcedurePicker procedures={procedures.data ?? []} />
                <DentistPicker dentists={dentists} myId={myDentistId} lastId={lastDentistId} childName={patient?.firstName} />
                {custom || noSlots ? (
                  <>
                    {noSlots && !custom && <p className="text-sm text-ink-muted">No open time in the next 2 weeks for this dentist. Pick a date and time.</p>}
                    <TimeFields chairs={chairs.data ?? []} />
                  </>
                ) : (
                  <SlotPicker slots={slots} chairs={chairs.data ?? []} dentistChosen={!!dentistId} onCustom={() => setCustom(true)} />
                )}
              </>
            )}
            <DialogFooter>
              <Button type="submit" disabled={book.isPending || reschedule.isPending}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
