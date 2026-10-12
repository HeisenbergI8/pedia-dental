"use client";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { CreateAppointmentRequestInput, TimeOfDay, canTransition, type Appointment } from "@pedia/shared";
import { FormField } from "@/components/form-field";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Can, useCan } from "@/features/auth/access";
import {
  STATUS_LABEL,
  TIME_OF_DAY_LABEL,
  useChangeAppointmentStatus,
  usePatientAppointments,
  usePatientRequests,
  useRequestAppointment,
} from "@/features/appointments/api";
import { useStaff } from "@/features/clinic/api";
import { useActiveChild } from "../use-child";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

export const whenText = (iso: string) => format(parseISO(iso), "EEEE, MMMM d 'at' h:mm a");
const UPCOMING = ["booked", "confirmed", "arrived", "in_chair"];
const upcoming = (rows: Appointment[]) => rows.filter((a) => UPCOMING.includes(a.status) && parseISO(a.startsAt) >= new Date(new Date().setHours(0, 0, 0, 0)));
export const nextAppointment = (rows: Appointment[]) => upcoming(rows)[0]; // the API sorts oldest first

/** "Confirm" on a booked visit, or a "Confirmed" mark once it is. */
export function ConfirmButton({ appointment: a, childName }: { appointment: Appointment; childName: string }) {
  const change = useChangeAppointmentStatus();
  const can = useCan();
  if (a.status === "confirmed") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-brand">
        <CheckCircle2Icon className="size-4" aria-hidden /> Confirmed
      </span>
    );
  }
  if (!canTransition(a.status, "confirmed") || !can("appointments.confirm")) return null;
  return (
    <Button
      className="min-h-11"
      disabled={change.isPending}
      onClick={() =>
        change.mutate(
          { id: a.id, status: "confirmed" },
          {
            onSuccess: () => toast.success(`Thanks! ${childName}'s visit on ${format(parseISO(a.startsAt), "MMMM d")} is confirmed.`),
            onError: (e) => toast.error(e.message),
          },
        )
      }
    >
      Confirm visit
    </Button>
  );
}

export function PortalAppointments() {
  const child = useActiveChild();
  const { data: rows = [], isLoading, error, refetch, isRefetching } = usePatientAppointments(child.id);
  const staff = useStaff().data ?? [];
  const dentist = (id: string) => staff.find((s) => s.id === id)?.fullName ?? "your dentist";
  const past = rows.filter((a) => !upcoming(rows).includes(a)).reverse().slice(0, 10);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">{child.firstName}&apos;s appointments</h1>
      {isLoading && <Loading label="Loading appointments" />}
      {error && <ErrorState what="the appointments" onRetry={() => refetch()} retrying={isRefetching} />}

      <SectionCard title="Coming up" description="To move or cancel a visit, please call the clinic.">
        {upcoming(rows).length === 0 ? (
          <p className="text-ink-muted">No visits booked.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming(rows).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p>
                  <span className="block font-medium">{whenText(a.startsAt)}</span>
                  <span className="block text-ink-muted">{a.reason} with {dentist(a.dentistId)}</span>
                </p>
                <ConfirmButton appointment={a} childName={child.firstName} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <Can permission="appointments.request">
        <RequestAppointment />
      </Can>

      {past.length > 0 && (
        <SectionCard title="Past visits">
          <ul className="divide-y divide-line text-ink-muted">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>{format(parseISO(a.startsAt), "MMMM d, yyyy")} · {a.reason}</span>
                <span>{STATUS_LABEL[a.status]}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function RequestAppointment() {
  const child = useActiveChild();
  const pending = (usePatientRequests(child.id).data ?? []).find((r) => r.status === "pending");
  const request = useRequestAppointment(child.id);
  const today = format(new Date(), "yyyy-MM-dd");
  const form = useForm<CreateAppointmentRequestInput>({
    resolver: zodResolver(CreateAppointmentRequestInput),
    defaultValues: { preferredDate: today, timeOfDay: "any", reason: "", note: "" },
  });

  return (
    <SectionCard title="Request an appointment" description="Tell us when suits you. The clinic will call to confirm a time.">
      <div id="request" />
      {pending ? (
        <p role="status">
          We have your request for {format(parseISO(pending.preferredDate), "EEEE, MMMM d")} ({TIME_OF_DAY_LABEL[pending.timeOfDay].toLowerCase()}).
          The clinic will call you to book it.
        </p>
      ) : (
        <FormProvider {...form}>
          <form
            noValidate
            className="max-w-md space-y-4"
            onSubmit={form.handleSubmit((input) =>
              request.mutate(input, {
                onSuccess: () => toast.success("Request sent. The clinic will call you."),
                onError: (e) => toast.error(e.message),
              }),
            )}
          >
            <FormField name="preferredDate" label="Preferred date">
              <Input type="date" min={today} className="min-h-11" {...form.register("preferredDate")} />
            </FormField>
            <FormField name="timeOfDay" label="Time of day">
              {(control) => (
                <Controller
                  name="timeOfDay"
                  control={form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger {...control} className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TimeOfDay.options.map((t) => <SelectItem key={t} value={t}>{TIME_OF_DAY_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </FormField>
            <FormField name="reason" label="What is the visit for?">
              <Input placeholder="Check-up, toothache, cleaning" {...form.register("reason")} />
            </FormField>
            <FormField name="note" label="Anything we should know? (optional)">
              <Textarea rows={3} {...form.register("note")} />
            </FormField>
            <Button type="submit" className="min-h-11" disabled={request.isPending}>
              {request.isPending ? "Sending" : "Send request"}
            </Button>
          </form>
        </FormProvider>
      )}
    </SectionCard>
  );
}
