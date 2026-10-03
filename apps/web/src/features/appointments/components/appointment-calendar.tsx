"use client";
import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { canReschedule, type Appointment, type AppointmentStatus, type Chair } from "@pedia/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { useChairs } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, useAppointments, useRescheduleAppointment } from "../api";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";
import { AppointmentSheet } from "./appointment-sheet";

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { "en-US": enUS } });

type CalendarEvent = { appointment: Appointment; title: string; start: Date; end: Date; resourceId: string; chairName: string };
const DnDCalendar = withDragAndDrop<CalendarEvent, Chair>(Calendar);

const VIEWS = {
  day: { label: "Day", step: addDays, title: (d: Date) => format(d, "EEE, MMM d, yyyy") },
  week: {
    label: "Week",
    step: addWeeks,
    title: (d: Date) => `${format(startOfWeek(d), "MMM d")} – ${format(endOfWeek(d), "MMM d, yyyy")}`,
  },
  month: { label: "Month", step: addMonths, title: (d: Date) => format(d, "MMMM yyyy") },
  // One day as a list: readable on a phone, and a screen-reader friendly alternative to the grid.
  agenda: { label: "List", step: addDays, title: (d: Date) => format(d, "EEE, MMM d, yyyy") },
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

/** Two lines that each cut off cleanly, so narrow week columns and short slots stay legible. */
function EventLabel({ event }: { event: CalendarEvent }) {
  return (
    <span className="block min-w-0 text-xs leading-tight">
      <strong className="block truncate">{event.title}</strong>
      <span className="block truncate">
        {STATUS_LABEL[event.appointment.status]} · {event.appointment.reason}
      </span>
    </span>
  );
}

/** The list view doesn't report clicks, so each row is its own button. */
function AgendaEventLabel({ event, onOpen }: { event: CalendarEvent; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event.appointment.id)}
      className="flex min-h-10 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md text-left hover:text-brand focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <strong className="font-semibold">{event.title}</strong>
      <span className="text-ink-muted">{event.appointment.reason} · {event.chairName}</span>
      <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium">{STATUS_LABEL[event.appointment.status]}</span>
    </button>
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
  // Phones open on the list: three chair columns don't fit 375px. Set after mount to keep SSR markup stable.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setView("agenda");
  }, []);
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
        chairName: chairs.data?.find((c) => c.id === a.chairId)?.name ?? "",
      }));
  }, [appointments.data, patients.data, chairs.data]);

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
  const components = useMemo(
    () => ({
      event: EventLabel,
      month: { event: MonthEventLabel },
      agenda: { event: ({ event }: { event: CalendarEvent }) => <AgendaEventLabel event={event} onOpen={setSelectedId} /> },
    }),
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Appointments"
        actions={
          <Button onClick={() => setDraft({ start: date })}>
            <PlusIcon /> New appointment
          </Button>
        }
      />
      {appointments.error && <p className="text-danger">Couldn&apos;t load appointments.</p>}
      {/* Outside the scroll box, so it stays usable on a phone while the grid scrolls sideways. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDate(new Date())}>Today</Button>
          <div className="flex">
            <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => setDate(VIEWS[view].step(date, -1))}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Next" onClick={() => setDate(VIEWS[view].step(date, 1))}>
              <ChevronRightIcon />
            </Button>
          </div>
          <p className="text-base font-semibold" aria-live="polite">{VIEWS[view].title(date)}</p>
        </div>
        {/* A segmented control: one choice, visibly grouped. */}
        <div className="flex w-full rounded-lg bg-line/60 p-1 sm:w-auto" role="group" aria-label="Calendar view">
          {(Object.keys(VIEWS) as CalendarView[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === view}
              onClick={() => setView(v)}
              className={cn(
                "h-8 flex-1 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                v === view ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
              )}
            >
              {VIEWS[v].label}
            </button>
          ))}
        </div>
      </div>
      <div className={`calendar calendar-${view} overflow-x-auto rounded-xl border border-line bg-surface p-3 shadow-card`}>
        <div
          className={cn(
            view === "agenda" ? "min-h-64" : view === "day" ? "h-[64rem] min-w-[40rem]" : "min-w-[48rem]",
            view === "week" && "h-[64rem]",
            view === "month" && "h-[48rem]",
          )}
        >
          <DnDCalendar
            localizer={localizer}
            events={events}
            date={date}
            view={view}
            views={["day", "week", "month", "agenda"]}
            length={1}
            toolbar={false}
            onNavigate={setDate}
            onView={(v) => setView(v as CalendarView)}
            // Chair columns only in day view; a week split by chair is too wide to read.
            resources={view === "day" ? chairs.data : undefined}
            resourceIdAccessor={(c) => c.id}
            resourceTitleAccessor={(c) => c.name}
            // The time axis already shows when an event starts; the room goes to the patient's name.
            formats={{ eventTimeRangeFormat: () => "", dayFormat: (d: Date) => format(d, "EEE d") }}
            // Overlapping appointments sit side by side instead of stacking on top of each other.
            dayLayoutAlgorithm="no-overlap"
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
            // The list prints status as a pill; colouring whole rows there would bury the muted text.
            eventPropGetter={(e) => (view === "agenda" ? {} : { className: cn("!rounded-md border", STATUS_CLASS[e.appointment.status]) })}
            components={components}
            messages={{ noEventsInRange: "No appointments on this day." }}
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
