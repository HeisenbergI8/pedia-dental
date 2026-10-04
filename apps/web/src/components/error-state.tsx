import { CloudOffIcon, RotateCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A query that failed: what didn't load, in plain words, and a way to try again. `compact` is one line
 * for side cards and tabs.
 */
export function ErrorState({
  what,
  onRetry,
  retrying,
  compact,
  className,
}: {
  /** What failed to load, as the clinic says it: "the appointments", "Mazie's bills". */
  what: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const retry = onRetry && (
    <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
      <RotateCwIcon aria-hidden className={cn(retrying && "motion-safe:animate-spin")} />
      {retrying ? "Trying again" : "Try again"}
    </Button>
  );
  if (compact) {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-danger", className)}>
        <CloudOffIcon aria-hidden className="size-4 shrink-0" />
        <span>We couldn&apos;t load {what}.</span>
        {retry}
      </div>
    );
  }
  return (
    <div role="alert" className={cn("flex flex-col items-center gap-3 rounded-xl border border-danger-line bg-danger-bg px-6 py-8 text-center", className)}>
      <CloudOffIcon aria-hidden className="size-6 text-danger" />
      <div className="max-w-sm space-y-1">
        <p className="font-semibold text-danger">We couldn&apos;t load {what}</p>
        <p className="text-sm text-ink-muted">Check your connection, then try again.</p>
      </div>
      {retry}
    </div>
  );
}
