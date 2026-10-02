"use client";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useVisits } from "@/features/visits/api";
import { useNotes } from "../api";
import { BEHAVIOR_LABEL } from "./note-dialog";

const SHOWN_VISITS = 6;

/** How the child behaved at recent visits, oldest to newest, so the dentist can prepare before seating. */
export function BehaviorTrend({ patientId }: { patientId: string }) {
  const visits = useVisits(patientId).data ?? [];
  const notes = useNotes(patientId).data ?? [];
  const recent = visits.slice(0, SHOWN_VISITS).reverse();

  return (
    <section className="space-y-3 rounded-lg border border-line bg-white p-5">
      <h2 className="text-lg font-semibold">Behavior, last {SHOWN_VISITS} visits</h2>
      {recent.length === 0 ? (
        <p className="text-ink-muted">No visits yet.</p>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
                    <Badge key={b} variant={b === "cooperative" ? "default" : "outline"}>{BEHAVIOR_LABEL[b]}</Badge>
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
