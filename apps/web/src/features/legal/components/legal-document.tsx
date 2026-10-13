import { PENDING_REVIEW, type LegalDocument } from "@pedia/shared";
import { formatDate } from "@/lib/format";

/** Privacy #2: one template with its version, date and the "pending legal review" label always in view. */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <p className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-muted">{PENDING_REVIEW}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-sm text-ink-muted">
          Version {doc.version} · {formatDate(doc.date)}
        </p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{s.heading}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
