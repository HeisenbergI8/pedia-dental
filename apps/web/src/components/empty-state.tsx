import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** First-use and no-results states: say what is missing and offer the next step. */
export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-subtle text-brand">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-sm text-ink-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
