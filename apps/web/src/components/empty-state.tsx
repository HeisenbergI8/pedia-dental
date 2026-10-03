import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * First-use and no-results states: say what is missing and offer the next step. The icon sits in the
 * brand's hand-drawn badge (ink outline, crayon offset shadow), one of the few places the motif is used.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center", className)}>
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-crayon-outline bg-sunny text-ink shadow-crayon">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="font-display text-lg font-semibold">{title}</p>
        {children && <div className="text-sm text-ink-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
