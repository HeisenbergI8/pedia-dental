import { CheckIcon, HammerIcon } from "lucide-react";
import { PageHeader } from "./page-header";

/** Placeholder for a feature screen that hasn't been built yet. */
export function ComingSoon({ title, description, covers }: { title: string; description?: string; covers: string[] }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <section className="max-w-xl space-y-4 rounded-xl border border-dashed border-line-strong bg-surface p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-brand">
            <HammerIcon className="size-5" aria-hidden />
          </span>
          <div>
            <p className="font-semibold">Coming in a later release</p>
            <p className="text-sm text-ink-muted">This screen isn&apos;t built yet. It will cover:</p>
          </div>
        </div>
        <ul className="space-y-2">
          {covers.map((c) => (
            <li key={c} className="flex gap-2.5 text-sm">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              {c}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
