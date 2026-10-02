"use client";
import { useState } from "react";
import { differenceInYears, parseISO } from "date-fns";
import { ALL_TEETH, ToothCondition, type Surface, type ToothNumber, type ToothState } from "@pedia/shared";
import { Button } from "@/components/ui/button";
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

      {/* Teeth stay tappable on a phone: the chart scrolls sideways inside its card instead of shrinking. */}
      <div className="overflow-x-auto">
        <div className="mx-auto max-w-3xl min-w-[34rem]">
          {rows.map((row, i) => (
            <div
              key={i}
              className={cn(
                "grid grid-cols-2",
                // The occlusal plane, between the upper and lower jaw.
                row.jaw === "lower" && rows[i - 1]?.jaw === "upper" && "mt-2 border-t-2 border-line pt-2",
              )}
            >
              {row.halves.map((teeth, side) => (
                <div
                  key={side}
                  className={cn("grid grid-cols-8 gap-0.5 py-1", side === 0 ? "border-r-2 border-line pr-1" : "pl-1")}
                >
                  {teeth.map((t, j) => (
                    <div key={t} className={cn(side === 0 && j === 0 && teeth.length === 5 && "col-start-4")}>
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
                <rect x="1" y="1" width="14" height="14" fill={CONDITION_STYLE[c].fill} stroke="#4a6261"
                  strokeDasharray={CONDITION_STYLE[c].mark === "dashed" ? "3 2" : undefined} />
                {CONDITION_STYLE[c].mark === "cross" && <path d="M3 3 13 13 M13 3 3 13" stroke="#12302f" strokeWidth="1.5" />}
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

