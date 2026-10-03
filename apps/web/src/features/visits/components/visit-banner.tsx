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
import { useStaff } from "@/features/clinic/api";
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

  if (isLoading) return null;

  if (current) {
    const dentist = staff.data?.find((s) => s.id === current.dentistId)?.fullName ?? "Unknown dentist";
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand bg-brand-subtle px-4 py-3"
      >
        <p className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-ink">
            <StethoscopeIcon className="size-4.5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold text-brand">Visit in progress</span>
            <span className="block text-sm text-ink-muted">
              Started {format(parseISO(current.startedAt), "h:mm a")} with {dentist}. New records attach to this visit.
            </span>
          </span>
        </p>
        <Button
          variant="outline"
          disabled={complete.isPending}
          onClick={() => complete.mutate(current.id, { onSuccess: () => toast.success("Visit finished"), onError })}
        >
          Finish visit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3">
      <p className="text-sm text-ink-muted">No visit in progress. Start one to chart, write notes or take photos.</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={start.isPending || dentists.length === 0}>
            Start visit <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>With dentist</DropdownMenuLabel>
          {dentists.map((d) => (
            <DropdownMenuItem
              key={d.id}
              onSelect={() => start.mutate({ dentistId: d.id }, { onSuccess: () => toast.success("Visit started"), onError })}
            >
              {d.fullName}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
