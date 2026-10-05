"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, dateFnsLocalizer, type DateHeaderProps, type ResourceHeaderProps } from "react-big-calendar";
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
import { CLINIC_HOURS, canReschedule, countByDay, inStatusGroup, isStatusGroup, type Appointment, type AppointmentStatus, type Chair, type StatusGroup } from "@pedia/shared";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Loading } from "@/components/brand";
import { Segmented } from "@/components/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useChairs } from "@/features/clinic/api";
import { usePatients } from "@/features/patients/api";
import { PHONE, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, useAppointments, useRescheduleAppointment } from "../api";
import { AgendaList } from "./agenda-list";
import { AppointmentForm, type AppointmentDraft } from "./appointment-form";
import { AppointmentSheet } from "./appointment-sheet";
import { MonthCountGrid } from "./month-count-grid";
import { STATUS_ICON } from "./status-chip";

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
 * Grid event colours, from the status triples (as StatusChip). Each tile also leads with its status icon and prints
 * the status word, so they stay apart without colour. Confirmed is the brand tint: the day's committed work reads first.
 */
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  booked: "!bg-surface !text-ink !border-control-border shadow-xs",
  confirmed: "!bg-brand-subtle !text-brand-tint-ink !border-brand-ring",
  arrived: "!bg-warning-bg !text-warning !border-warning-line",
  in_chair: "!bg-info-bg !text-info !border-info-line",
  done: "!bg-ground !text-ink-muted !border-line",
  no_show: "!bg-surface !text-danger !border-danger-line", // the label says "No-show"; no strikethrough
  cancelled: "",
};

/** Two lines that each cut off cleanly, so narrow week columns and short slots stay legible. */
function EventLabel({ event }: { event: CalendarEvent }) {
  const Icon = STATUS_ICON[event.appointment.status];
  const name = event.title || <Skeleton className="inline-block h-3 w-16 align-middle" aria-hidden />;
  // A 15-minute tile has room for one line: icon, status word, then the name, which is what truncates.
  if (event.appointment.durationMin <= 20) {
    return (
      <span className="flex min-w-0 items-center gap-1 text-xs leading-tight">
        <Icon className="size-3 shrink-0" aria-hidden />
        <strong className="shrink-0">{STATUS_LABEL[event.appointment.status]}</strong>
        <span className="truncate">· {name}</span>
      </span>
    );
  }
  return (
    <span className="block min-w-0 text-xs leading-tight">
      <strong className="flex min-w-0 items-center gap-1">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{name}</span>
      </strong>
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
      <strong>{event.title || <Skeleton className="inline-block h-3 w-16 align-middle" aria-hidden />}</strong> · {STATUS_LABEL[event.appointment.status]}
    </span>
  );
}

const isView = (v: string | null): v is CalendarView => !!v && v in VIEWS;

/**
 * The date and view live in the URL (?date=2026-10-05&view=week), so refresh, back and a shared link
 * keep the place. Replaced, not pushed: stepping through days shouldn't fill the back button.
 */
/** Display copy for ?status= (the dashboard's tiles), so it stays out of the shared package. */
const GROUP_LABEL: Record<StatusGroup, string> = {
  upcoming: "still to come",
  waiting: "waiting",
  in_chair: "in the chair",
  done: "done",
  missed: "cancelled or no-show",
};

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
  // ?status= narrows the view to one dashboard group (STATUS_GROUPS); set() keeps it while paging days.
  const rawStatus = params.get("status");
  const status: StatusGroup | undefined = isStatusGroup(rawStatus) ? rawStatus : undefined;
  const clearStatus = () => {
    const q = new URLSearchParams(params);
    q.delete("status");
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  return {
    date,
    view,
    status,
    clearStatus,
    // One URL change for date and view together: two replace() calls in a row race and lose the first.
    go: set,
    setDate: (d: Date) => set({ date: d }),
    setView: (v: CalendarView) => set({ view: v }),
  };
}

export function AppointmentCalendar() {
  const { date, view, status, clearStatus, go, setDate, setView } = useCalendarPlace();
  // Phones: Day and Week as lists (chair columns and seven day columns don't fit 360px); Month as a count grid.
  const isPhone = useMediaQuery(PHONE);
  const offered: CalendarView[] = isPhone ? ["day", "week", "month"] : ["day", "week", "month", "agenda"];
  const phoneMonth = isPhone && view === "month";
  const asList = !phoneMonth && (view === "agenda" || isPhone);
  const listDays = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(date), i)) : [date];
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
      // Empty while names load (the tile draws a placeholder bar), never a made-up name.
      return p ? `${p.firstName} ${p.lastName}` : patients.isLoading ? "" : "Unknown patient";
    };
    return (appointments.data ?? [])
      // Cancelled ones stay hidden unless the filter asks for them (the dashboard's "Cancelled or no-show").
      .filter((a) => (status ? inStatusGroup(status, a.status) : a.status !== "cancelled"))
      .map((a) => ({
        appointment: a,
        title: name(a.patientId),
        start: new Date(a.startsAt),
        end: addMinutes(new Date(a.startsAt), a.durationMin),
        resourceId: a.chairId,
        chairName: chairs.data?.find((c) => c.id === a.chairId)?.name ?? "",
      }));
  }, [appointments.data, patients.data, patients.isLoading, chairs.data, status]);

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
  // Unfiltered live counts per day: the month numbers, and what decides whether a day can read as closed.
  const counts = useMemo(() => countByDay(appointments.data ?? []), [appointments.data]);
  // A string, not the Date: `date` is rebuilt every render, which would remount the header components below.
  const shownDay = format(date, "yyyy-MM-dd");
  const components = useMemo(
    () => ({
      event: EventLabel,
      month: {
        event: MonthEventLabel,
        // The day number plus how many appointments it has, so a busy day reads before its "+N more".
        dateHeader: ({ date: d, label }: DateHeaderProps) => {
          const n = counts.get(format(d, "yyyy-MM-dd")) ?? 0;
          return (
            <span className="flex items-center justify-between gap-1">
              <span>{label}</span>
              {n > 0 && <span className="text-xs font-semibold text-ink-muted tabular-nums">{n} appt{n === 1 ? "" : "s"}</span>}
            </span>
          );
        },
      },
      // Day view: each chair's column names how full it is, from the events already loaded.
      resourceHeader: ({ label, resource }: ResourceHeaderProps<Chair>) => {
        const n = events.filter((e) => e.resourceId === resource.id && format(e.start, "yyyy-MM-dd") === shownDay).length;
        return (
          <span className="flex items-center justify-between gap-2 px-1">
            <span className="font-title font-semibold">{label}</span>
            {n > 0 && <span className="text-xs font-medium text-ink-muted tabular-nums">{n} appt{n === 1 ? "" : "s"}</span>}
          </span>
        );
      },
    }),
    [counts, events, shownDay],
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
      {appointments.error && <ErrorState what="the appointments" onRetry={() => appointments.refetch()} retrying={appointments.isRefetching} />}
      {/* Outside the scroll box, so it stays usable on a phone while the grid scrolls sideways. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setDate(new Date())}>Today</Button>
          <div className="flex overflow-hidden rounded-md border border-control-border bg-surface shadow-xs">
            <Button variant="ghost" size="icon" className="rounded-none text-ink" aria-label="Previous" onClick={() => setDate(VIEWS[view].step(date, -1))}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-none border-l border-control-border text-ink" aria-label="Next" onClick={() => setDate(VIEWS[view].step(date, 1))}>
              <ChevronRightIcon />
            </Button>
          </div>
          <p className="font-title text-lg font-semibold tracking-tight" aria-live="polite">{VIEWS[view].title(date)}</p>
        </div>
        {/* On a phone the agenda is the day view, so Day reads as pressed there. */}
        <Segmented
          label="Calendar view"
          className="w-full sm:w-auto"
          value={isPhone && view === "agenda" ? "day" : view}
          onChange={setView}
          options={offered.map((v) => ({ value: v, label: VIEWS[v].label }))}
        />
      </div>
      {status && (
        <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
          Showing only <strong className="font-semibold">{GROUP_LABEL[status]}</strong>
          <Button variant="outline" size="sm" onClick={clearStatus}>
            Show all
          </Button>
        </p>
      )}
      {phoneMonth ? (
        appointments.isLoading ? (
          <Loading label="Loading appointments" rows={4} />
        ) : (
          <MonthCountGrid month={date} counts={counts} onPick={(d) => go({ date: d, view: "day" })} />
        )
      ) : asList ? (
        appointments.isLoading ? (
          <Loading label="Loading appointments" rows={4} />
        ) : (
          <AgendaList items={events} days={listDays} onOpen={setSelectedId} counts={counts} />
        )
      ) : (
        <div className={`calendar calendar-${view} overflow-x-auto rounded-2xl border border-line bg-surface p-3 shadow-card`}>
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
              min={addMinutes(new Date(1970, 0, 1), CLINIC_HOURS.opensAt)}
              max={addMinutes(new Date(1970, 0, 1), CLINIC_HOURS.closesAt)}
              scrollToTime={addMinutes(new Date(1970, 0, 1), CLINIC_HOURS.opensAt)}
              selectable
              onSelectSlot={({ start, end, resourceId }) =>
                setDraft({
                  start,
                  chairId: resourceId ? String(resourceId) : undefined,
                  durationMin: Math.max(differenceInMinutes(end, start), 15),
                })
              }
              onSelectEvent={(e) => setSelectedId(e.appointment.id)}
              tooltipAccessor={(e) => [e.title, STATUS_LABEL[e.appointment.status], e.appointment.reason].filter(Boolean).join(" · ")}
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
