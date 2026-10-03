"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMinutes, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { canReschedule, canTransition, type Appointment, type ChangeAppointmentStatusInput } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useCan } from "@/features/auth/access";
import { useChairs, useStaff } from "@/features/clinic/api";
import { usePatient } from "@/features/patients/api";
import { useStartVisit } from "@/features/visits/api";
import { STATUS_LABEL, useChangeAppointmentStatus } from "../api";
import { StatusChip } from "./status-chip";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Details({ appointment: a, onReschedule }: { appointment: Appointment; onReschedule: () => void }) {
  const router = useRouter();
  const patient = usePatient(a.patientId);
  const staff = useStaff();
  const chairs = useChairs();
  const change = useChangeAppointmentStatus();
  const startVisit = useStartVisit(a.patientId);
  const can = useCan();
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  // No-show is final (no transition leads out of it) and texts the parent, so it gets a confirm step.
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const start = parseISO(a.startsAt);
  const guardian = patient.data?.guardians.find((g) => g.isPrimary) ?? patient.data?.guardians[0];
  const onError = (e: Error) => toast.error(e.message);
  const setStatus = (input: ChangeAppointmentStatusInput) =>
    change.mutate({ id: a.id, ...input }, { onSuccess: () => toast.success(`Marked ${STATUS_LABEL[input.status].toLowerCase()}`), onError });
  const busy = change.isPending || startVisit.isPending;

  return (
    <>
      <SheetHeader>
        <SheetTitle>{patient.data ? `${patient.data.firstName} ${patient.data.lastName}` : "Appointment"}</SheetTitle>
        <SheetDescription>
          {format(start, "EEE, MMM d · h:mm")}–{format(addMinutes(start, a.durationMin), "h:mm a")}
        </SheetDescription>
      </SheetHeader>
      <dl className="space-y-3 px-4">
        <Row label="Status">
          <StatusChip status={a.status} />
        </Row>
        {a.cancelReason && <Row label="Cancel reason">{a.cancelReason}</Row>}
        <Row label="Reason">{a.reason}</Row>
        <Row label="Dentist">{staff.data?.find((s) => s.id === a.dentistId)?.fullName}</Row>
        <Row label="Chair">{chairs.data?.find((c) => c.id === a.chairId)?.name}</Row>
        <Link href={`/patients/${a.patientId}`} className="inline-block text-brand underline">
          Open patient record
        </Link>
      </dl>

      {confirmNoShow ? (
        <div role="group" aria-labelledby="no-show-title" className="space-y-2 px-4">
          <p id="no-show-title" className="font-semibold">Mark as a no-show?</p>
          <p className="text-sm text-ink-muted">
            This can&apos;t be undone, and it sends {guardian ? `${guardian.fullName} ` : "the parent "}a &ldquo;missed appointment&rdquo; text.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => setStatus({ status: "no_show" })}>
              Mark no-show
            </Button>
            <Button variant="outline" onClick={() => setConfirmNoShow(false)}>Keep it</Button>
          </div>
        </div>
      ) : cancelReason !== null ? (
        <div className="space-y-2 px-4">
          <Label htmlFor="cancel-reason">Why is it cancelled?</Label>
          <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={busy || !cancelReason.trim()}
              onClick={() => setStatus({ status: "cancelled", cancelReason })}
            >
              Cancel appointment
            </Button>
            <Button variant="outline" onClick={() => setCancelReason(null)}>Keep it</Button>
          </div>
        </div>
      ) : (
        <SheetFooter className="flex-row flex-wrap">
          {canTransition(a.status, "confirmed") && (
            <Button disabled={busy} onClick={() => setStatus({ status: "confirmed" })}>Confirm</Button>
          )}
          {canTransition(a.status, "arrived") && (
            <Button disabled={busy} onClick={() => setStatus({ status: "arrived" })}>Check in</Button>
          )}
          {canTransition(a.status, "in_chair") && can("clinical.write") && (
            <Button
              disabled={busy}
              onClick={() =>
                startVisit.mutate(
                  { dentistId: a.dentistId, appointmentId: a.id },
                  { onSuccess: () => router.push(`/patients/${a.patientId}`), onError },
                )
              }
            >
              Start visit
            </Button>
          )}
          {a.status === "in_chair" && (
            <Button asChild variant="outline">
              <Link href={`/patients/${a.patientId}`}>Go to visit</Link>
            </Button>
          )}
          {canReschedule(a.status) && (
            <Button variant="outline" disabled={busy} onClick={onReschedule}>Reschedule</Button>
          )}
          {canTransition(a.status, "no_show") && (
            <Button variant="outline" disabled={busy} onClick={() => setConfirmNoShow(true)}>No-show…</Button>
          )}
          {canTransition(a.status, "cancelled") && (
            <Button variant="outline" disabled={busy} onClick={() => setCancelReason("")}>Cancel…</Button>
          )}
        </SheetFooter>
      )}
    </>
  );
}

export function AppointmentSheet({
  appointment,
  onClose,
  onReschedule,
}: {
  appointment: Appointment | undefined;
  onClose: () => void;
  onReschedule: (a: Appointment) => void;
}) {
  return (
    <Sheet open={!!appointment} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        {appointment && (
          // Keyed so the cancel-reason draft doesn't carry over to another appointment.
          <Details key={appointment.id} appointment={appointment} onReschedule={() => onReschedule(appointment)} />
        )}
      </SheetContent>
    </Sheet>
  );
}
