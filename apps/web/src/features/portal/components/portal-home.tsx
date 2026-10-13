"use client";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { accountSummary, depositBalance, formatPeso, planProgress } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Can, useSession } from "@/features/auth/access";
import { usePatientAppointments } from "@/features/appointments/api";
import { useInvoices, usePayments } from "@/features/billing/api";
import { useStaff } from "@/features/clinic/api";
import { CARE_KINDS, KIND_LABEL, usePatientMessages } from "@/features/messages/api";
import { formatAge } from "@/features/patients/age";
import { usePlan } from "@/features/plan/api";
import { useActiveChild } from "../use-child";
import { ConfirmButton, nextAppointment, whenText } from "./portal-appointments";
import { PortalPrivacy } from "./portal-privacy";

const more = "inline-flex min-h-11 items-center font-medium text-brand underline-offset-2 hover:underline"; // 44 px target

export function PortalHome() {
  const child = useActiveChild();
  const parent = useSession()?.user.name.split(" ")[0];
  const appointments = usePatientAppointments(child.id).data ?? [];
  const staff = useStaff().data ?? [];
  const plan = usePlan(child.id).data ?? [];
  const invoices = useInvoices(child.id).data ?? [];
  const payments = usePayments(child.id).data ?? [];
  const care = (usePatientMessages(child.id).data ?? []).find((m) => CARE_KINDS.includes(m.kind) && m.status !== "cancelled");
  const next = nextAppointment(appointments);
  const { done, total } = planProgress(plan);
  const { balance } = accountSummary(invoices, payments);
  const held = depositBalance(payments, child.id);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">Hello{parent ? `, ${parent}` : ""}</h1>
        <p className="text-ink-muted">
          {child.firstName} {child.lastName}, {formatAge(child.birthDate)}
        </p>
      </header>

      <SectionCard title="Next visit" action={<Link href="/portal/appointments" className={more}>All appointments</Link>}>
        {next ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>
              <span className="block font-medium">{whenText(next.startsAt)}</span>
              <span className="block text-ink-muted">
                {next.reason} with {staff.find((s) => s.id === next.dentistId)?.fullName ?? "your dentist"}
              </span>
            </p>
            <ConfirmButton appointment={next} childName={child.firstName} />
          </div>
        ) : (
          <p className="text-ink-muted">
            No visits booked.{" "}
            <Can permission="appointments.request">
              <Link href="/portal/appointments#request" className={more}>Request an appointment</Link>
            </Can>
          </p>
        )}
      </SectionCard>

      <div className="grid gap-5 sm:grid-cols-2">
        <SectionCard title="Treatment plan" action={<Link href="/portal/plan" className={more}>See the plan</Link>}>
          <p>{total ? `${done} of ${total} treatments done` : "Nothing planned right now"}</p>
        </SectionCard>
        <SectionCard title="Bills" action={<Link href="/portal/billing" className={more}>See bills</Link>}>
          <p className="tabular-nums">{balance > 0 ? `Balance ${formatPeso(balance)}` : "Nothing to pay"}</p>
          {held > 0 && <p className="text-sm text-ink-muted tabular-nums">{formatPeso(held)} on deposit</p>}
        </SectionCard>
      </div>

      {care && (
        <SectionCard title={KIND_LABEL[care.kind]} description={format(parseISO(care.sendAt), "MMMM d, yyyy")} action={<Link href="/portal/care" className={more}>All instructions</Link>}>
          <p className="line-clamp-3 whitespace-pre-line">{care.body}</p>
        </SectionCard>
      )}

      <p className="text-sm text-ink-muted">
        Allergies we have on file for {child.firstName}: {child.allergies.length ? child.allergies.join(", ") : "none"}. If this is wrong, please tell
        the clinic.
      </p>
      <PortalPrivacy />
    </div>
  );
}
