import type { ReactNode } from "react";

/**
 * The top of every screen: title, an optional one-line description, and the screen's actions (primary last). The title
 * and description break inside a long unbroken word (a clinic's or child's name) rather than push the page sideways.
 */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{title}</h1>
        {description && <p className="text-sm text-ink-muted wrap-anywhere">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
