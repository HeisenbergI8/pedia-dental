import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One choice of a few, visibly grouped (DESIGN_SYSTEM §8): a track with a white pill on the chosen option.
 * Buttons with aria-pressed in a labelled group, so it reads as a set of toggles. Not tabs: nothing is a tabpanel.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex rounded-lg bg-track p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-(--control-h-sm) flex-1 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors duration-(--duration-fast) sm:flex-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            o.value === value ? "bg-surface font-semibold text-ink shadow-xs" : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
