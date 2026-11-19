import { ClinicLogo } from "@/features/clinic/components/clinic-logo";
import { cn } from "@/lib/utils";
import type { DocBlock, DocContent } from "../content";

/** The document as it will print, as real text: accessible and readable on a phone. */
export function DocumentPreview({ content }: { content: DocContent }) {
  const custom = content.letterhead.custom;
  const lines = custom && "header" in custom ? custom : { header: [], footer: [] };
  return (
    <article aria-label={`Preview of the ${content.title.toLowerCase()}`} className="mx-auto w-full max-w-2xl space-y-4 rounded-xl border border-line bg-surface p-5 text-sm shadow-card sm:p-8">
      <header className="space-y-0.5 border-b-2 border-brand-ring pb-3">
        {custom && "imageUrl" in custom ? (
          // D11: the clinic's own letterhead image carries its logo and address.
          // eslint-disable-next-line @next/next/no-img-element -- served by the API, replaced by the Owner any time
          <img src={custom.imageUrl} alt={`${content.letterhead.clinicName} letterhead`} className="mb-1 max-h-28 w-full object-contain" />
        ) : (
          <>
            <ClinicLogo className="mb-1 w-36" />
            <p className="text-xs text-ink-muted">{content.letterhead.branchLine}</p>
            {lines.header.map((l) => <p key={l} className="text-xs text-ink-muted">{l}</p>)}
          </>
        )}
        <h3 className="font-semibold tracking-wide uppercase">{content.title}</h3>
        <p className="text-ink-muted">{content.subtitle}</p>
      </header>
      {content.blocks.map((b, i) => <PreviewBlock key={i} block={b} />)}
      {lines.footer.length > 0 && <p className="border-t border-line pt-3 text-center text-xs text-ink-muted">{lines.footer.join(" · ")}</p>}
      {content.footnote && <p className="border-t border-line pt-3 text-xs text-ink-muted">{content.footnote}</p>}
    </article>
  );
}

function PreviewBlock({ block }: { block: DocBlock }) {
  if (block.kind === "signatures") {
    return (
      <div className="grid gap-8 pt-8 sm:grid-cols-2">
        {block.lines.map((l) => (
          <div key={l.label} className="border-t border-ink pt-1">
            <p>{l.name ?? " "}</p>
            <p className="text-ink-muted">{l.detail ? `${l.label} · ${l.detail}` : l.label}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <section className="space-y-1.5">
      {block.heading && <h4 className="font-semibold">{block.heading}</h4>}
      {block.kind === "rows" && (
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1">
          {block.rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {block.kind === "text" && block.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      {block.kind === "table" && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-line-strong">
              <tr>{block.head.map((h, i) => <th key={h} scope="col" className={cn("py-1 pr-3 font-semibold", block.numeric?.includes(i) && "text-right")}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line">
                  {r.map((c, i) => <td key={i} className={cn("py-1 pr-3", block.numeric?.includes(i) && "text-right tabular-nums")}>{c}</td>)}
                </tr>
              ))}
            </tbody>
            {block.foot && (
              <tfoot>
                <tr>{block.foot.map((c, i) => <td key={i} className={cn("py-1 pr-3 font-semibold", block.numeric?.includes(i) && "text-right tabular-nums")}>{c}</td>)}</tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
