import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * First-use and no-results states: say what is missing and offer the next step. Staff screens are quiet (a brand-tint
 * icon tile); `tone="warm"` keeps the hand-drawn badge (ink outline, crayon offset shadow) for the portal and success.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  tone = "quiet",
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** "warm": the hand-drawn badge and Fredoka, for the parent portal and success moments only. */
  tone?: "quiet" | "warm";
  className?: string;
}) {
  const warm = tone === "warm";
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-2xl border border-line bg-surface px-6 py-10 text-center", className)}>
      {warm ? (
        <span className="flex size-14 items-center justify-center rounded-full border-2 border-crayon-outline bg-sunny text-ink shadow-crayon">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : (
        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-subtle text-brand">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <div className="max-w-sm space-y-1">
        <p className={cn("text-lg font-semibold", warm ? "font-display" : "font-title")}>{title}</p>
        {children && <div className="text-sm text-ink-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
