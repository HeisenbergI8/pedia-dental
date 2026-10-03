"use client";
import { format, parseISO } from "date-fns";
import type { ClinicalNote, NoteTemplate, Patient, TemplateField } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan } from "@/features/auth/access";
import { useStaff } from "@/features/clinic/api";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useNoteTemplates, useNotes } from "../api";
import { BEHAVIOR_LABEL, NoteDialog } from "./note-dialog";
import { Loading } from "@/components/brand";

function display(f: TemplateField, v: unknown): string | undefined {
  if (f.type === "checkbox") return v === true ? "Yes" : undefined;
  if (f.type === "teeth") return Array.isArray(v) && v.length ? v.join(", ") : undefined;
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function NotesTab({ patient }: { patient: Patient }) {
  const { data: notes, isLoading, error } = useNotes(patient.id);
  const canWrite = useCan()("clinical.write");
  const templates = useNoteTemplates().data ?? [];
  const visits = useVisits(patient.id).data ?? [];
  const current = useCurrentVisit(patient.id);
  const staff = useStaff().data ?? [];

  if (isLoading) return <Loading label="Loading notes…" />;
  if (error || !notes) return <p className="text-danger">Couldn&apos;t load notes.</p>;
  const withNotes = visits.filter((v) => v.status === "in_progress" || notes.some((n) => n.visitId === v.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Clinical notes</h2>
        {!canWrite ? null : current ? (
          <NoteDialog patient={patient} visit={current} trigger={<Button>New note</Button>} />
        ) : (
          <p className="text-sm text-ink-muted">Start a visit to write a note.</p>
        )}
      </div>
      {withNotes.length === 0 && <p className="text-ink-muted">No notes yet.</p>}
      {withNotes.map((v) => (
        <section key={v.id} className="space-y-3">
          <h3 className="font-semibold">
            Visit of {format(parseISO(v.date), "MMM d, yyyy")}
            {v.status === "in_progress" && <Badge className="ml-2">Current</Badge>}
          </h3>
          {notes
            .filter((n) => n.visitId === v.id)
            .map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                patient={patient}
                template={templates.find((t) => t.id === n.templateId)}
                author={staff.find((s) => s.id === n.authorId)?.fullName}
              />
            ))}
          {!notes.some((n) => n.visitId === v.id) && <p className="text-sm text-ink-muted">No notes for this visit yet.</p>}
        </section>
      ))}
    </div>
  );
}

function NoteCard({
  note,
  patient,
  template,
  author,
}: {
  note: ClinicalNote;
  patient: Patient;
  template?: NoteTemplate;
  author?: string;
}) {
  const rows = (template?.fields ?? []).flatMap((f) => {
    const text = display(f, note.values[f.key]);
    return text ? [{ label: f.label, text }] : [];
  });

  return (
    <article className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{template?.name ?? "Unknown template"}</p>
          <p className="text-sm text-ink-muted">
            {author ?? "Unknown author"}
            {note.signedAt && ` · signed ${format(parseISO(note.signedAt), "MMM d, yyyy h:mm a")}`}
          </p>
        </div>
        {note.signedAt ? (
          <Badge variant="outline">Signed</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Draft</Badge>
            <Can permission="clinical.write">
              <NoteDialog patient={patient} note={note} trigger={<Button size="sm" variant="outline">Edit or sign</Button>} />
            </Can>
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-ink-muted">{r.label}</dt>
              <dd className="whitespace-pre-line">{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {(note.behavior.length > 0 || note.behaviorNote) && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-ink-muted">Behavior:</span>
          {note.behavior.map((b) => (
            <Badge key={b} variant="outline">{BEHAVIOR_LABEL[b]}</Badge>
          ))}
          {note.behaviorNote && <span>{note.behaviorNote}</span>}
        </p>
      )}
    </article>
  );
}
