"use client";
import { useState } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { ALL_TEETH, ToothCondition, type Surface, type ToothNumber, type ToothState } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { PHONE, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { CONDITION_STYLE, ChartPatterns, Tooth } from "./tooth";

export type ChartMode = "primary" | "mixed" | "permanent";
const MODES: { value: ChartMode; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "mixed", label: "Mixed" },
  { value: "permanent", label: "Permanent" },
];

/** A starting guess from age; staff switch modes freely. */
export function defaultChartMode(birthDate: string, today = new Date()): ChartMode {
  const age = differenceInYears(today, parseISO(birthDate));
  return age < 6 ? "primary" : age < 13 ? "mixed" : "permanent";
}

/** Teeth in one FDI quadrant, from the midline outward. */
const quadrant = (q: number) => ALL_TEETH.filter((t) => Math.floor(t / 10) === q);

/** Rows top to bottom as on the paper chart: [viewer's left half, viewer's right half]. */
const ROWS: { jaw: "upper" | "lower"; dentition: "primary" | "permanent"; halves: [ToothNumber[], ToothNumber[]] }[] = [
  { jaw: "upper", dentition: "permanent", halves: [quadrant(1).reverse(), quadrant(2)] },
  { jaw: "upper", dentition: "primary", halves: [quadrant(5).reverse(), quadrant(6)] },
  { jaw: "lower", dentition: "primary", halves: [quadrant(8).reverse(), quadrant(7)] },
  { jaw: "lower", dentition: "permanent", halves: [quadrant(4).reverse(), quadrant(3)] },
];

export function DentalChart({
  chart,
  defaultMode = "mixed",
  selected = [],
  onSelect,
}: {
  chart: Map<ToothNumber, ToothState>;
  defaultMode?: ChartMode;
  selected?: ToothNumber[];
  onSelect?: (tooth: ToothNumber, surface?: Surface) => void;
}) {
  const [mode, setMode] = useState(defaultMode);
  const rows = ROWS.filter((r) => mode === "mixed" || r.dentition === mode);
  // Phones show one half of the mouth at a time: 8 teeth across instead of 16, so every tooth is a
  // full-size target instead of a sideways-scrolling strip. 0 = patient's right (viewer's left).
  const isPhone = useMediaQuery(PHONE);
  const [half, setHalf] = useState<0 | 1>(0);
  const sides: (0 | 1)[] = isPhone ? [half] : [0, 1];

  return (
    <div className="space-y-4">
      <ChartPatterns />
      <div role="group" aria-label="Dentition" className="flex gap-1">
        {MODES.map((m) => (
          <Button
            key={m.value}
            type="button"
            size="sm"
            variant={mode === m.value ? "default" : "outline"}
            aria-pressed={mode === m.value}
            onClick={() => setMode(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      {isPhone && (
        <div role="group" aria-label="Side of the mouth" className="flex rounded-lg bg-line/60 p-1">
          {(["Patient's right", "Patient's left"] as const).map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={half === i}
              onClick={() => setHalf(i as 0 | 1)}
              className={cn(
                "h-(--control-h-sm) flex-1 rounded-md text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                half === i ? "bg-surface text-ink shadow-card" : "text-ink-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div>
        <div className="mx-auto max-w-4xl">
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                isPhone ? "grid" : "grid grid-cols-2",
                // The occlusal plane, between the upper and lower jaw.
                row.jaw === "lower" && rows[i - 1]?.jaw === "upper" && "mt-2 border-t-2 border-line pt-2",
              )}
            >
              {sides.map((side) => ({ side, teeth: row.halves[side] })).map(({ side, teeth }) => (
                <div
                  key={side}
                  className={cn(
                    // A phone half shows exactly its teeth (5 primary or 8 permanent) across the full width.
                    "grid gap-0.5 py-1",
                    isPhone ? (teeth.length === 5 ? "grid-cols-5" : "grid-cols-8") : "grid-cols-8",
                    !isPhone && (side === 0 ? "border-r-2 border-line pr-1" : "pl-1"),
                  )}
                >
                  {teeth.map((t, j) => (
                    <div key={t} className={cn(!isPhone && side === 0 && j === 0 && teeth.length === 5 && "col-start-4")}>
                      <Tooth tooth={t} state={chart.get(t)} selected={selected.includes(t)} onSelect={onSelect} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {ToothCondition.options
          .filter((c) => c !== "sound")
          .map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                <rect x="1" y="1" width="14" height="14" fill={CONDITION_STYLE[c].fill} stroke="var(--color-tooth-stroke)"
                  strokeDasharray={CONDITION_STYLE[c].mark === "dashed" ? "3 2" : undefined} />
                {CONDITION_STYLE[c].mark === "cross" && <path d="M3 3 13 13 M13 3 3 13" stroke="var(--color-tooth-mark)" strokeWidth="1.5" />}
              </svg>
              <span>
                {CONDITION_STYLE[c].label} <span className="font-semibold text-ink-muted">{CONDITION_STYLE[c].code}</span>
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}

