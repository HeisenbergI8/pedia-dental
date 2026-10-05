"use client";
import { format, parseISO } from "date-fns";
import { ChevronDownIcon, StethoscopeIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCan, useSession } from "@/features/auth/access";
import { useStaff } from "@/features/clinic/api";
import { withoutTitle } from "@/lib/format";
import { useCompleteVisit, useCurrentVisit, useStartVisit, useVisits } from "../api";

/** Sits above the patient tabs, so every tab shows which visit new records attach to. */
export function VisitBanner({ patientId }: { patientId: string }) {
  const { isLoading } = useVisits(patientId);
  const current = useCurrentVisit(patientId);
  const staff = useStaff();
  const start = useStartVisit(patientId);
  const complete = useCompleteVisit(patientId);
  const dentists = staff.data?.filter((s) => s.role === "dentist") ?? [];
  const onError = (e: Error) => toast.error(e.message);
  const canWrite = useCan()("clinical.write");
  const myId = useSession()?.user.staffId;
  const me = dentists.find((d) => d.id === myId); // only a dentist can be the one-click default
  const startWith = (dentistId: string) => start.mutate({ dentistId }, { onSuccess: () => toast.success("Visit started"), onError });

  if (isLoading) return null;

  if (current) {
    const dentist = staff.data?.find((s) => s.id === current.dentistId)?.fullName ?? "Unknown dentist";
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-ring bg-brand-subtle px-4 py-3"
      >
        <p className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-deep text-on-deep">
            <StethoscopeIcon className="size-4.5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-brand-tint-ink">Visit in progress</span>
            <span className="block text-sm text-ink-muted">
              Started {format(parseISO(current.startedAt), "h:mm a")} with {dentist}. New records attach to this visit.
            </span>
          </span>
        </p>
        {canWrite && (
          <Button
            variant="outline"
            disabled={complete.isPending}
            onClick={() => complete.mutate(current.id, { onSuccess: () => toast.success("Visit finished"), onError })}
          >
            Finish visit
          </Button>
        )}
      </div>
    );
  }

  if (!canWrite) return null; // front desk: "visit in progress" is shown above; there's nothing to start

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 shadow-card">
      {/* One line on a phone: the tabs, not the banner, should own the first screen. */}
      <p className="text-sm text-ink-muted">
        No visit in progress.<span className="hidden sm:inline"> Start one to chart, write notes or take photos.</span>
      </p>
      <div className="flex shrink-0">
        {me && (
          <Button className="rounded-r-none" disabled={start.isPending} onClick={() => startWith(me.id)}>
            <span>
              Start visit<span className="hidden sm:inline"> as {withoutTitle(me.fullName)}</span>
            </span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {me ? (
              <Button size="icon" className="rounded-l-none border-l border-on-deep/30" aria-label="Start with another dentist" disabled={start.isPending}>
                <ChevronDownIcon />
              </Button>
            ) : (
              <Button disabled={start.isPending || dentists.length === 0}>
                Start visit <ChevronDownIcon />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>With dentist</DropdownMenuLabel>
            {dentists.map((d) => (
              <DropdownMenuItem key={d.id} onSelect={() => startWith(d.id)}>
                {d.fullName}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
