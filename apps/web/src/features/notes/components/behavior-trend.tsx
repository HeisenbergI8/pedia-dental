"use client";
import { format, parseISO } from "date-fns";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Badge } from "@/components/ui/badge";
import { useVisits } from "@/features/visits/api";
import { useNotes } from "../api";
import { BEHAVIOR_LABEL } from "./note-dialog";

const SHOWN_VISITS = 6;

/** How the child behaved at recent visits, oldest to newest, so the dentist can prepare before seating. */
export function BehaviorTrend({ patientId }: { patientId: string }) {
  const visitsQuery = useVisits(patientId);
  const notesQuery = useNotes(patientId);
  const visits = visitsQuery.data ?? [];
  const notes = notesQuery.data ?? [];
  const recent = visits.slice(0, SHOWN_VISITS).reverse();
  const failed = visitsQuery.error ?? notesQuery.error;
  const retry = () => {
    visitsQuery.refetch();
    notesQuery.refetch();
  };

  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      {/* The heading counts what is shown: "last 2 visits" for a child with two, "last visit" for one. */}
      <h2 className="text-base font-semibold">
        {recent.length > 1 ? `Behavior, last ${recent.length} visits` : recent.length === 1 ? "Behavior, last visit" : "Behavior"}
      </h2>
      {failed ? (
        <ErrorState what="the behavior history" onRetry={retry} retrying={visitsQuery.isRefetching || notesQuery.isRefetching} />
      ) : visitsQuery.isLoading ? (
        <Loading label="Loading behavior history" />
      ) : recent.length === 0 ? (
        <p className="text-ink-muted">No visits yet.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {recent.map((v) => {
            const visitNotes = notes.filter((n) => n.visitId === v.id && n.signedAt); // drafts aren't history yet
            const behavior = [...new Set(visitNotes.flatMap((n) => n.behavior))];
            const remarks = visitNotes.flatMap((n) => (n.behaviorNote ? [n.behaviorNote] : []));
            return (
              <li key={v.id} className="space-y-1.5 rounded-md bg-ground p-3">
                <p className="text-sm font-medium">{format(parseISO(v.date), "MMM d, yyyy")}</p>
                {behavior.length === 0 && <p className="text-sm text-ink-muted">Not recorded</p>}
                <div className="flex flex-wrap gap-1">
                  {behavior.map((b) => (
                    <Badge key={b} variant="outline" className={b === "cooperative" ? "border-success/30 bg-success-bg text-success" : undefined}>{BEHAVIOR_LABEL[b]}</Badge>
                  ))}
                </div>
                {remarks.map((r, i) => (
                  <p key={i} className="text-xs text-ink-muted">{r}</p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
