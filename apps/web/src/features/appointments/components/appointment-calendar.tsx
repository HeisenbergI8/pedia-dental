"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  isValid,
  parse,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { enUS } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { canReschedule, type Appointment, type AppointmentStatus, type Chair } from "@pedia/shared";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Loading } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { useChairs } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { PHONE, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, useAppointments, useRescheduleAppointment } from "../api";
import { AgendaList } from "./agenda-list";
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

/**
 * Grid event colours, from the status triples (as StatusChip). The printed status word keeps them apart
 * without colour. Confirmed is the one solid fill: the day's committed work reads first.
 */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  booked: "!bg-surface !text-ink !border-brand border-dashed",
  confirmed: "!bg-brand !text-brand-ink !border-brand",
  arrived: "!bg-warning-bg !text-warning !border-warning-line",
  in_chair: "!bg-info-bg !text-info !border-info-line",
  done: "!bg-ground !text-ink-muted !border-line",
  no_show: "!bg-surface !text-danger !border-danger-line line-through",
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

/** One line, so the month view can measure rows and fold the rest into "+N more". */
function MonthEventLabel({ event }: { event: CalendarEvent }) {
  return (
    <span className="text-xs">
      <strong>{event.title}</strong> · {STATUS_LABEL[event.appointment.status]}
    </span>
  );
}

const isView = (v: string | null): v is CalendarView => !!v && v in VIEWS;

/**
 * The date and view live in the URL (?date=2026-10-05&view=week), so refresh, back and a shared link
 * keep the place. Replaced, not pushed: stepping through days shouldn't fill the back button.
 */
function useCalendarPlace() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = params.get("date") ? parseISO(params.get("date")!) : null;
  const date = fromUrl && isValid(fromUrl) ? fromUrl : new Date();
  const view: CalendarView = isView(params.get("view")) ? (params.get("view") as CalendarView) : "day";
  const set = (next: { date?: Date; view?: CalendarView }) => {
    const q = new URLSearchParams(params);
    q.set("date", format(next.date ?? date, "yyyy-MM-dd"));
    q.set("view", next.view ?? view);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  return { date, view, setDate: (d: Date) => set({ date: d }), setView: (v: CalendarView) => set({ view: v }) };
}

export function AppointmentCalendar() {
  const { date, view, setDate, setView } = useCalendarPlace();
  // Phones: Day and Week as lists (chair columns and seven day columns don't fit 360px); no month grid.
  const isPhone = useMediaQuery(PHONE);
  const offered: CalendarView[] = isPhone ? ["day", "week"] : ["day", "week", "month", "agenda"];
  const asList = view === "agenda" || isPhone;
  const listDays = view === "week" || (isPhone && view === "month") ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [date];
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
  const components = useMemo(() => ({ event: EventLabel, month: { event: MonthEventLabel } }), []);

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
      {appointments.error && <ErrorState what="the appointments" onRetry={() => appointments.refetch()} retrying={appointments.isRefetching} />}
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
          {offered.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={v === view || (isPhone && view !== "day" && v === "week")}
              onClick={() => setView(v)}
              className={cn(
                "h-(--control-h-sm) flex-1 rounded-md px-3 text-sm font-medium transition-colors duration-(--duration-fast) sm:flex-none",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                v === view || (isPhone && view !== "day" && v === "week") ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink",
              )}
            >
              {VIEWS[v].label}
            </button>
          ))}
        </div>
      </div>
      {asList ? (
        appointments.isLoading ? (
          <Loading label="Loading appointments…" rows={4} />
        ) : (
          <AgendaList items={events} days={listDays} onOpen={setSelectedId} />
        )
      ) : (
        <div className={`calendar calendar-${view} overflow-x-auto rounded-xl border border-line bg-surface p-3 shadow-card`}>
          <div
            className={cn(
              view === "day" ? "h-[64rem] min-w-[40rem]" : "min-w-[48rem]",
              view === "week" && "h-[64rem]",
              view === "month" && "h-[48rem]",
            )}
          >
            <DnDCalendar
              localizer={localizer}
              events={events}
              date={date}
              view={view}
              views={["day", "week", "month"]}
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
              eventPropGetter={(e) => ({ className: cn("!rounded-md border", STATUS_CLASS[e.appointment.status]) })}
              components={components}
            />
          </div>
        </div>
      )}
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
