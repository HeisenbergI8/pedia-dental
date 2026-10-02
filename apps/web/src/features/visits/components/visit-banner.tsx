"use client";
import { format, parseISO } from "date-fns";
import { ChevronDownIcon } from "lucide-react";
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
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-brand bg-white px-4 py-3"
      >
        <p>
          <span className="font-semibold text-brand">Visit in progress</span>
          <span className="text-ink-muted"> · started {format(parseISO(current.startedAt), "h:mm a")} with {dentist}</span>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-line px-4 py-3">
      <p className="text-ink-muted">No visit in progress.</p>
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
