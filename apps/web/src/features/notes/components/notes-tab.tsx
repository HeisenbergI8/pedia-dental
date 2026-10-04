"use client";
import { format, parseISO } from "date-fns";
import {
  formatPeso,
  groupFields,
  noteServices,
  type ClinicalNote,
  type NoteService,
  type NoteTemplate,
  type PatientView,
  type TemplateField,
} from "@pedia/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can, useCan, useSession } from "@/features/auth/access";
import { useInvoices } from "@/features/billing/api";
import { useProcedures, useStaff } from "@/features/clinic/api";
import { DownloadDocumentButton } from "@/features/documents/components/download-document-button";
import { usePlan } from "@/features/plan/api";
import { useCurrentVisit, useVisits } from "@/features/visits/api";
import { useNoteTemplates, useNotes } from "../api";
import { BEHAVIOR_LABEL, NoteDialog } from "./note-dialog";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

function display(f: TemplateField, v: unknown): string | undefined {
  if (f.type === "checkbox") return v === true ? "Yes" : undefined;
  if (f.type === "teeth") return Array.isArray(v) && v.length ? v.join(", ") : undefined;
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function NotesTab({ patient }: { patient: PatientView }) {
  const { data: notes, isLoading, error, refetch, isRefetching } = useNotes(patient.id);
  const canWrite = useCan()("clinical.write");
  const templates = useNoteTemplates().data ?? [];
  const visits = useVisits(patient.id).data ?? [];
  const current = useCurrentVisit(patient.id);
  const staff = useStaff().data ?? [];
  const can = useCan();
  const canSeePrices = can("billing.view");
  const staffId = useSession()?.user.staffId; // the issuer: whoever is signed in on this device
  const plan = usePlan(patient.id).data ?? [];
  const invoices = useInvoices(patient.id, { enabled: canSeePrices }).data ?? []; // disabled without billing.view: no 403
  const procedures = useProcedures().data ?? [];

  if (isLoading) return <Loading label="Loading notes" />;
  if (error || !notes) return <ErrorState what="the notes" onRetry={() => refetch()} retrying={isRefetching} />;
  const canExport = can("documents.issue") && !!staffId && notes.some((n) => n.signedAt);
  const withNotes = visits.filter((v) => v.status === "in_progress" || notes.some((n) => n.visitId === v.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Clinical notes</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Logged first, then built (download-document-button.tsx), like every other document. */}
          {canExport && (
            <DownloadDocumentButton variant="outline" patientId={patient.id} choice={{ type: "notes_report", issuedBy: staffId }} label="Export report" />
          )}
          {!canWrite ? null : current ? (
            <NoteDialog patient={patient} visit={current} trigger={<Button>New note</Button>} />
          ) : (
            <p className="text-sm text-ink-muted">Start a visit to write a note.</p>
          )}
        </div>
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
                services={n.signedAt ? noteServices(n, plan, invoices, procedures) : []}
                showPrices={canSeePrices}
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
  services,
  showPrices,
}: {
  note: ClinicalNote;
  patient: PatientView;
  template?: NoteTemplate;
  author?: string;
  services: NoteService[];
  showPrices: boolean;
}) {
  // A section reads as one row ("TMJ: Clicking, Trismus"); unchecked boxes aren't listed.
  const rows = groupFields(template?.fields ?? []).flatMap((g) => {
    if (!g.section) {
      const f = g.fields[0];
      const text = display(f, note.values[f.key]);
      return text ? [{ label: f.label, text }] : [];
    }
    const shown = g.fields.flatMap((f) => {
      const text = display(f, note.values[f.key]);
      return text ? [f.type === "checkbox" ? f.label : `${f.label}: ${text}`] : [];
    });
    return shown.length ? [{ label: g.section, text: shown.join(", ") }] : [];
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
      {services.length > 0 && (
        <div className="space-y-1 border-t border-line pt-3">
          <p className="text-sm font-medium">Services</p>
          <ul className="space-y-1 text-sm">
            {services.map((s) => (
              <li key={s.planItemId} className="flex items-baseline justify-between gap-3">
                <span>
                  {s.name}
                  {s.tooth && ` · tooth ${s.tooth}`}
                </span>
                {showPrices && (
                  <span className="whitespace-nowrap tabular-nums">
                    {formatPeso(s.amount)}
                    {!s.billed && <span className="ml-1 text-ink-muted">(not billed yet)</span>}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {showPrices && services.some((s) => s.billed) && <p className="text-xs text-ink-muted">Billed prices are before any invoice discount.</p>}
        </div>
      )}
    </article>
  );
}
