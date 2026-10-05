import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * The Primoral mark: a P whose counter is a molar, with a smile on its crown. The bowl curls back
 * without closing, so the tooth's root runs out between the stem and the curl. Drawn once here, in
 * the artwork's own units; icon.svg, the app icons and primoral-logo.png (the PDF) are cut from it.
 */
const MARK_P =
  "M123 143H300A161 161 0 0 1 300 465H276A39 39 0 0 1 276 387C330 387 379 350 379 300C379 262 360 239 335 239" +
  "C304 239 286 247 274 256Q268 261 262 256C250 247 236 239 218 239C196 239 180 252 176 272" +
  "C173 290 181 320 181 350V510A20 20 0 0 1 161 530H115A20 20 0 0 1 95 510V171A28 28 0 0 1 123 143Z";
const MARK_SMILE = "M240 330Q288 384 336 330";

/** The mark's paths, coloured from the logo tokens so it follows the theme. The P is a soft diagonal gradient. */
function MarkPaths({ animated }: { animated?: boolean }) {
  const gradient = useId();
  return (
    <>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-logo-hi)" />
          <stop offset="1" stopColor="var(--color-logo-lo)" />
        </linearGradient>
      </defs>
      <path d={MARK_P} fill={`url(#${gradient})`} />
      <path
        d={MARK_SMILE}
        pathLength={1}
        className={animated ? "pm-smile" : undefined}
        fill="none"
        stroke="var(--color-logo-smile)"
        strokeWidth={28}
        strokeLinecap="round"
      />
    </>
  );
}

/** The mark on its own: the tablet rail, loaders. Decorative; the caller names it. */
export function PrimoralMark({ className, animated }: { className?: string; animated?: boolean }) {
  return (
    <svg aria-hidden viewBox="71 128 418 418" className={cn("size-11", animated && "pm-bob", className)}>
      <MarkPaths animated={animated} />
    </svg>
  );
}

/**
 * The full logo: the mark and "Primoral" in Outfit (--font-brand), laid out as the approved artwork.
 * Use it wherever the clinic introduces itself. One SVG, so `className` widths scale it whole.
 */
export function PrimoralLogo({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="Primoral" viewBox="56 126 1852 468" className={cn("h-auto w-40", className)}>
      <g transform="translate(-58.48 -46.32) scale(1.205)">
        <MarkPaths />
      </g>
      <text x="611" y="488" fontSize="336" fontWeight="560" fill="var(--color-logo-ink)" style={{ fontFamily: "var(--font-brand)" }}>
        Primoral
      </text>
    </svg>
  );
}

/**
 * Content inside an open page that is still loading: a skeleton shaped like a list, so the layout
 * doesn't jump when the rows arrive. Fades in after a beat so fast loads don't flash. `compact` is one
 * line, for tight spots like the patient header or a side card. The label is for screen readers.
 */
export function Loading({ label = "Loading", compact, rows = 3, className }: { label?: string; compact?: boolean; rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("pm-fade-in", compact ? "py-3" : "space-y-3 py-2", className)}>
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

/** A whole page or area on its way (navigation, route loading): the animated mark. */
export function PageLoading({ label = "Opening" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="pm-fade-in flex flex-col items-center gap-3 py-16 text-center">
      <PrimoralMark animated className="size-14" />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** The whole screen while the app starts up, signs in or switches areas. */
export function LoadingScreen({ label = "Getting things ready" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-ground px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <PrimoralMark animated className="size-20 sm:size-24" />
        <div aria-hidden>
          <p className="font-brand text-4xl leading-none font-[560] text-logo-ink sm:text-5xl">Primoral</p>
          <p className="mt-2 text-xs font-semibold tracking-brand text-ink uppercase">Pediatric Dental Clinic</p>
        </div>
      </div>
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}
