"use client";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useStaff } from "@/features/clinic/api";
import { cn } from "@/lib/utils";
import { useVisits } from "../api";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

export function VisitList({ patientId }: { patientId: string }) {
  const { data: visits, isLoading, error, refetch, isRefetching } = useVisits(patientId);
  const staff = useStaff();
  const dentistName = (id: string) => staff.data?.find((s) => s.id === id)?.fullName ?? "Unknown dentist";

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 className="text-base font-semibold">Visits</h2>
      {isLoading && <Loading label="Loading visits" />}
      {error && <ErrorState compact what="the visits" onRetry={() => refetch()} retrying={isRefetching} />}
      {visits?.length === 0 && <p className="text-ink-muted">No visits yet.</p>}
      {!!visits?.length && (
        <ul className="divide-y divide-line">
          {visits.map((v) => (
            <li
              key={v.id}
              aria-current={v.status === "in_progress" ? "true" : undefined}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 py-2.5",
                v.status === "in_progress" && "-mx-2 rounded-md bg-ground px-2 font-medium",
              )}
            >
              <span>
                {format(parseISO(v.date), "MMM d, yyyy")}
                <span className="text-ink-muted"> · {dentistName(v.dentistId)}</span>
              </span>
              {v.status === "in_progress" ? <Badge>In progress</Badge> : <Badge variant="outline">Completed</Badge>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
