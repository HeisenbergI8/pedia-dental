"use client";
import { useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop, { type EventInteractionArgs } from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import {
  addDays,
  addMinutes,
  addMonths,
  addWeeks,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { toast } from "sonner";
import { canReschedule, type Appointment, type AppointmentStatus, type Chair } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { useChairs } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, useAppointments, useRescheduleAppointment } from "../api";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";
import { AppointmentSheet } from "./appointment-sheet";

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { "en-US": enUS } });

type CalendarEvent = { appointment: Appointment; title: string; start: Date; end: Date; resourceId: string };
const DnDCalendar = withDragAndDrop<CalendarEvent, Chair>(Calendar);

const VIEWS = {
  day: { label: "Day", step: addDays, title: (d: Date) => format(d, "EEE, MMM d, yyyy") },
  week: {
    label: "Week",
    step: addWeeks,
    title: (d: Date) => `${format(startOfWeek(d), "MMM d")} – ${format(endOfWeek(d), "MMM d, yyyy")}`,
  },
  month: { label: "Month", step: addMonths, title: (d: Date) => format(d, "MMMM yyyy") },
};
type CalendarView = keyof typeof VIEWS;

/** Finished and missed appointments are faded; the printed status keeps them apart without colour. */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  booked: "!bg-white !text-ink !border-brand border-dashed",
  confirmed: "!bg-brand !text-brand-ink !border-brand",
  arrived: "!bg-alert-bg !text-alert !border-alert",
  in_chair: "!bg-alert !text-white !border-alert",
  done: "!bg-ground !text-ink-muted !border-line",
  no_show: "!bg-white !text-danger !border-danger line-through",
  cancelled: "",
};

function EventLabel({ event }: { event: CalendarEvent }) {
  return (
    <span className="text-xs leading-tight">
      <strong>{event.title}</strong> · {STATUS_LABEL[event.appointment.status]}
      <br />
      {event.appointment.reason}
    </span>
  );
}

/** One line, so the month view can measure rows and fold the rest into "+N more". */
function MonthEventLabel({ event }: { event: CalendarEvent }) {
  return (
    <span className="text-xs">
      <strong>{event.title}</strong> · {STATUS_LABEL[event.appointment.status]}
    </span>
  );
}

export function AppointmentCalendar() {
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("day");
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<AppointmentDraft | null>(null);

  // One fetch covers every view of the month on screen, including the spill-over weeks.
  const from = startOfWeek(startOfMonth(date)).toISOString();
  const to = endOfWeek(endOfMonth(date)).toISOString();
  const appointments = useAppointments(from, to);
  const patients = usePatients();
  const chairs = useChairs();
  const reschedule = useRescheduleAppointment();

  const events = useMemo<CalendarEvent[]>(() => {
    const name = (id: string) => {
      const p = patients.data?.find((x) => x.id === id);
      return p ? `${p.firstName} ${p.lastName}` : "…";
    };
    return (appointments.data ?? [])
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({
        appointment: a,
        title: name(a.patientId),
        start: new Date(a.startsAt),
        end: addMinutes(new Date(a.startsAt), a.durationMin),
        resourceId: a.chairId,
      }));
  }, [appointments.data, patients.data]);

  function move({ event, start, end, resourceId }: EventInteractionArgs<CalendarEvent>) {
    const a = event.appointment;
    reschedule.mutate(
      {
        id: a.id,
        dentistId: a.dentistId,
        chairId: resourceId ? String(resourceId) : a.chairId,
        reason: a.reason,
        startsAt: new Date(start).toISOString(),
        durationMin: differenceInMinutes(new Date(end), new Date(start)),
      },
      { onSuccess: () => toast.success("Appointment moved"), onError: (e) => toast.error(e.message) },
    );
  }

  const selected = appointments.data?.find((a) => a.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <Button onClick={() => setDraft({ start: date })}>New appointment</Button>
      </div>
      {appointments.error && <p className="text-danger">Couldn&apos;t load appointments.</p>}
      {/* Outside the scroll box, so it stays usable on a phone while the grid scrolls sideways. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" aria-label="Previous" onClick={() => setDate(VIEWS[view].step(date, -1))}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => setDate(VIEWS[view].step(date, 1))}>
            <ChevronRightIcon />
          </Button>
        </div>
        <p className="font-medium" aria-live="polite">{VIEWS[view].title(date)}</p>
        <div className="flex gap-1" role="group" aria-label="Calendar view">
          {(Object.keys(VIEWS) as CalendarView[]).map((v) => (
            <Button key={v} variant={v === view ? "default" : "outline"} aria-pressed={v === view} onClick={() => setView(v)}>
              {VIEWS[v].label}
            </Button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white p-3">
        <div className={cn(view === "day" ? "min-w-[40rem]" : "min-w-[48rem]", view === "month" ? "h-[48rem]" : "h-[64rem]")}>
          <DnDCalendar
            localizer={localizer}
            events={events}
            date={date}
            view={view}
            views={["day", "week", "month"]}
            toolbar={false}
            onNavigate={setDate}
            onView={(v) => setView(v as CalendarView)}
            // Chair columns only in day view; a week split by chair is too wide to read.
            resources={view === "day" ? chairs.data : undefined}
            resourceIdAccessor={(c) => c.id}
            resourceTitleAccessor={(c) => c.name}
            // The time axis already shows when an event starts; the room goes to the patient's name.
            formats={{ eventTimeRangeFormat: () => "" }}
            step={15}
            timeslots={4}
            min={new Date(1970, 0, 1, 8)}
            max={new Date(1970, 0, 1, 18)}
            scrollToTime={new Date(1970, 0, 1, 8)}
            selectable
            onSelectSlot={({ start, end, resourceId }) =>
              setDraft({
                start,
                chairId: resourceId ? String(resourceId) : undefined,
                durationMin: Math.max(differenceInMinutes(end, start), 15),
              })
            }
            onSelectEvent={(e) => setSelectedId(e.appointment.id)}
            draggableAccessor={(e) => canReschedule(e.appointment.status)}
            resizableAccessor={(e) => canReschedule(e.appointment.status)}
            onEventDrop={move}
            onEventResize={move}
            eventPropGetter={(e) => ({ className: cn("!rounded-md border", STATUS_CLASS[e.appointment.status]) })}
            components={{ event: EventLabel, month: { event: MonthEventLabel } }}
          />
        </div>
      </div>
      <AppointmentSheet
        appointment={selected}
        onClose={() => setSelectedId(undefined)}
        onReschedule={(a) => {
          setSelectedId(undefined);
          setDraft({ appointment: a });
        }}
      />
      <AppointmentForm draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
