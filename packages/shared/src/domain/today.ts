import { addDays, differenceInYears, format, parseISO, startOfWeek } from "date-fns";
import type { Appointment, AppointmentRequest } from "../schemas/appointment";
import type { StaffMember } from "../schemas/clinic";
import type { Message } from "../schemas/message";
import type { Patient } from "../schemas/patient";
import type { TodaySummary } from "../schemas/today";
import type { Visit } from "../schemas/visit";
import { STATUS_GROUPS, inStatusGroup } from "./appointments";
import { birthdayGreeting, isBirthdayOn } from "./messages";
import { visitDays } from "./patient-list";

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const dayOf = (iso: string) => ymd(new Date(iso)); // clinic-local, as finance.ts
const WEEK = { weekStartsOn: 1 } as const; // Monday, as finance.ts

type Inputs = {
  patients: Pick<Patient, "id" | "firstName" | "lastName" | "birthDate">[];
  staff: Pick<StaffMember, "id" | "fullName">[];
  appointments: Appointment[];
  appointmentRequests: Pick<AppointmentRequest, "status">[];
  visits: Pick<Visit, "patientId" | "status" | "date">[];
  messages: Pick<Message, "patientId" | "kind" | "createdAt" | "status">[];
};

/**
 * Per day of today's week: how many children were seen for the first time ever (new) and how many had been
 * seen before (returning). A child counts once per day. Days after today are zero.
 */
export function visitMix({ patients, visits, appointments }: Pick<Inputs, "patients" | "visits" | "appointments">, today: string) {
  const start = startOfWeek(parseISO(today), WEEK);
  const seen = patients.map((p) => visitDays(p.id, visits, appointments));
  return Array.from({ length: 7 }, (_, i) => {
    const date = ymd(addDays(start, i));
    const here = seen.filter((days) => date <= today && days.includes(date));
    const fresh = here.filter((days) => days[0] === date).length;
    return { date, new: fresh, returning: here.length - fresh };
  });
}

export function todaySummary(input: Inputs, today: string): TodaySummary {
  const name = (id: string) => {
    const p = input.patients.find((x) => x.id === id);
    return p ? `${p.lastName}, ${p.firstName}` : "Patient";
  };
  const todays = input.appointments.filter((a) => dayOf(a.startsAt) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const count = (group: keyof typeof STATUS_GROUPS) => todays.filter((a) => inStatusGroup(group, a.status)).length;
  return {
    today,
    counts: {
      total: todays.length,
      upcoming: count("upcoming"),
      waiting: count("waiting"),
      inChair: count("in_chair"),
      done: count("done"),
      missed: count("missed"),
      requests: input.appointmentRequests.filter((r) => r.status === "pending").length,
    },
    appointments: todays.map((a) => ({
      id: a.id, patientId: a.patientId, patientName: name(a.patientId), startsAt: a.startsAt, durationMin: a.durationMin,
      reason: a.reason, dentistName: input.staff.find((s) => s.id === a.dentistId)?.fullName ?? "", status: a.status,
    })),
    birthdays: input.patients
      .filter((p) => isBirthdayOn(p.birthDate, today))
      .map((p) => ({
        patientId: p.id,
        patientName: name(p.id),
        turning: differenceInYears(parseISO(today), parseISO(p.birthDate)),
        greeting: birthdayGreeting(input.messages, p.id, today)?.status,
      })),
    visitMix: visitMix(input, today),
  };
}
