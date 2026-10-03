import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A secondary line of short facts ("9:25 AM · Cash · ref 4100067 · AR-000067") that stays scannable when
 * it wraps on a phone: each fact moves to the next line whole instead of breaking mid-way, and no line
 * starts or ends on a stray "·".
 *
 * How: each fact carries its own leading dot, the row is pulled 1rem left, and the outer box clips that
 * 1rem, so the dot in front of the first fact on every line is hidden. Empty facts are dropped, so
 * callers can pass optional ones inline (`ref && \`ref ${ref}\``).
 */
export function MetaLine({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter((item) => item !== null && item !== undefined && item !== false && item !== "");
  if (shown.length === 0) return null;
  return (
    // The 4px of padding (cancelled by the negative margin) keeps link focus rings inside the clip.
    <div className={cn("-mx-1 -my-0.5 overflow-hidden px-1 py-0.5 text-sm text-ink-muted", className)}>
      <div className="-ml-4 flex flex-wrap">
        {shown.map((item, i) => (
          <span key={i} className="flex max-w-full min-w-0">
            <span aria-hidden className="w-4 shrink-0 text-center">·</span>
            <span className="min-w-0">{item}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
