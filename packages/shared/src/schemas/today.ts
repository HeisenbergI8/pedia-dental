import { z } from "zod";
import { AppointmentStatus } from "./appointment";
import { Id, IsoDate, IsoDateTime } from "./common";
import { MessageStatus } from "./message";

const Count = z.number().int().nonnegative();

/** One row of "Today's appointments". Names are joined server-side so the dashboard needn't load every patient. */
export const TodayAppointment = z.object({
  id: Id, patientId: Id, patientName: z.string(), startsAt: IsoDateTime, durationMin: z.number().int(),
  reason: z.string(), dentistName: z.string(), status: AppointmentStatus,
});
export type TodayAppointment = z.infer<typeof TodayAppointment>;

/** `greeting`: this year's birthday message status, absent when not greeted yet (the button shows). */
export const TodayBirthday = z.object({ patientId: Id, patientName: z.string(), turning: Count, greeting: MessageStatus.optional() });
export type TodayBirthday = z.infer<typeof TodayBirthday>;

export const VisitMixDay = z.object({ date: IsoDate, new: Count, returning: Count });

/** "Today at a glance" for every staff role. Computed by todaySummary on every request; nothing stored. */
export const TodaySummary = z.object({
  today: IsoDate,
  // total = upcoming + waiting + inChair + done + missed (every appointment today, cancelled included)
  counts: z.object({ total: Count, upcoming: Count, waiting: Count, inChair: Count, done: Count, missed: Count, requests: Count }),
  appointments: z.array(TodayAppointment), // by start time
  birthdays: z.array(TodayBirthday),
  visitMix: z.array(VisitMixDay), // Monday to Sunday of today's week; days after today are zero
});
export type TodaySummary = z.infer<typeof TodaySummary>;
