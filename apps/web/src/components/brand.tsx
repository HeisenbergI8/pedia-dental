import Image from "next/image";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import logo from "../../public/brand/kidsmile-logo.png";

/** The clinic's real logo artwork. Use it wherever the clinic introduces itself. */
export function KidsmileLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src={logo} alt="Kidsmile Pediatric Dental Clinic" priority={priority} className={cn("h-auto w-40", className)} />;
}

/** The wordmark's letters and their crayon colours, as drawn in the logo. */
const LETTERS = [
  ["K", "orange"],
  ["i", "purple"],
  ["d", "lime"],
  ["s", "teal"],
  ["m", "teal"],
  ["i", "teal"],
  ["l", "teal"],
  ["e", "teal"],
] as const;

/**
 * The logo, animated: the letters hop in a wave while the toothbrush scrubs underneath and blows
 * bubbles. Decorative (aria-hidden); the caller supplies the words. Scale it with `className` font
 * size, since every part is sized in em. Reduced motion shows it standing still (globals.css).
 */
export function KidsmileMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("ks-mark inline-flex flex-col items-stretch", className)}>
      <span className="ks-word flex items-end">
        {LETTERS.map(([ch, color], i) => (
          <span key={i} className="ks-letter" data-crayon={color} style={{ animationDelay: `${i * 0.09}s` }}>
            {ch}
          </span>
        ))}
      </span>
      <svg viewBox="0 0 400 48" className="ks-brush w-0 min-w-full overflow-visible" fill="none">
        <g className="ks-brush-body">
          {/* Handle: white top, yellow underside, like the logo's. */}
          <rect x="4" y="28" width="392" height="16" rx="8" fill="var(--color-crayon-yellow)" />
          <rect x="10" y="29.5" width="380" height="6" rx="3" fill="var(--color-surface)" />
          <rect x="4" y="28" width="392" height="16" rx="8" stroke="var(--color-crayon-outline)" strokeWidth="3" />
          {/* Bristle head. */}
          <path
            d="M304 30 V6 q0 -6 6 -6 q4 -4 9 0 q5 -4 10 0 q5 -4 10 0 q5 -4 10 0 q5 -4 10 0 q5 -4 10 0 q5 0 6 6 V30 Z"
            fill="var(--color-crayon-pink)"
            stroke="var(--color-crayon-outline)"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M322 10 V26 M340 10 V26 M358 10 V26 M376 10 V26" stroke="var(--color-crayon-outline)" strokeWidth="2.5" strokeLinecap="round" />
          {/* Foam. */}
          {[
            [318, -8, 6, 0],
            [346, -12, 8, 0.45],
            [374, -6, 5, 0.9],
          ].map(([cx, cy, r, delay]) => (
            <circle
              key={cx}
              className="ks-bubble"
              cx={cx}
              cy={cy}
              r={r}
              fill="var(--color-surface)"
              stroke="var(--color-brand-soft)"
              strokeWidth="2.5"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      </svg>
    </span>
  );
}

/**
 * Content inside an open page that is still loading: a skeleton shaped like a list, so the layout
 * doesn't jump when the rows arrive. Fades in after a beat so fast loads don't flash. `compact` is one
 * line, for tight spots like the patient header or a side card. The label is for screen readers.
 */
export function Loading({ label = "Loading…", compact, rows = 3, className }: { label?: string; compact?: boolean; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("ks-fade-in", compact ? "py-3" : "space-y-3 py-2", className)}>
      <span className="sr-only">{label}</span>
      {compact ? (
        <Skeleton className="h-5 w-48 max-w-full" />
      ) : (
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** A whole page or area on its way (navigation, route loading): the animated logo. */
export function PageLoading({ label = "Opening…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="ks-fade-in flex flex-col items-center gap-3 py-16 text-center">
      <KidsmileMark className="text-3xl" />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** The whole screen while the app starts up, signs in or switches areas. */
export function LoadingScreen({ label = "Getting things ready…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <KidsmileMark className="text-5xl sm:text-6xl" />
        <p className="text-xs font-semibold tracking-brand text-ink uppercase">Pediatric Dental Clinic</p>
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
