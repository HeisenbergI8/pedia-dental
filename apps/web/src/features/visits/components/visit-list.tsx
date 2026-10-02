"use client";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useStaff } from "@/features/clinic/api";
import { cn } from "@/lib/utils";
import { useVisits } from "../api";

export function VisitList({ patientId }: { patientId: string }) {
  const { data: visits, isLoading, error } = useVisits(patientId);
  const staff = useStaff();
  const dentistName = (id: string) => staff.data?.find((s) => s.id === id)?.fullName ?? "Unknown dentist";

  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Visits</h2>
      {isLoading && <p className="text-ink-muted">Loading visits…</p>}
      {error && <p className="text-danger">Couldn&apos;t load visits.</p>}
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
