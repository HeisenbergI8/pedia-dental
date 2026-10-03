"use client";
import { isAnterior, surfacesFor, type Surface, type ToothCondition, type ToothNumber, type ToothState } from "@pedia/shared";
import { cn } from "@/lib/utils";

type ConditionStyle = {
  label: string;
  /** Printed under the tooth number, so a condition never relies on colour alone. */
  code: string;
  fill: string;
  mark?: "cross" | "dashed";
};

/** Fills differ in lightness or pattern as well as hue (see the legend). */
export const CONDITION_STYLE: Record<ToothCondition, ConditionStyle> = {
  sound: { label: "Sound", code: "", fill: "var(--color-tooth-sound)" },
  caries: { label: "Caries", code: "C", fill: "var(--color-tooth-caries)" },
  restored: { label: "Restored", code: "R", fill: "var(--color-tooth-restored)" },
  sealant: { label: "Sealant", code: "Se", fill: "url(#pd-stripes)" },
  fluoride: { label: "Fluoride", code: "F", fill: "url(#pd-dots)" },
  pulpotomy: { label: "Pulpotomy", code: "PO", fill: "url(#pd-bars)" },
  pulpectomy: { label: "Pulpectomy", code: "PE", fill: "var(--color-tooth-pulpectomy)" },
  extracted: { label: "Extracted", code: "X", fill: "var(--color-tooth-extracted)", mark: "cross" },
  missing: { label: "Missing", code: "M", fill: "var(--color-tooth-sound)", mark: "cross" },
  unerupted: { label: "Unerupted", code: "UE", fill: "var(--color-tooth-sound)", mark: "dashed" },
  erupting: { label: "Erupting", code: "E", fill: "var(--color-tooth-erupting)", mark: "dashed" },
};

/** Pattern fills, rendered once per chart and referenced by `url(#id)`. */
export function ChartPatterns() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        <pattern id="pd-stripes" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--color-tooth-sealant-bg)" />
          <rect width="2.5" height="5" fill="var(--color-tooth-sealant)" />
        </pattern>
        <pattern id="pd-dots" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="var(--color-tooth-fluoride-bg)" />
          <circle cx="2.5" cy="2.5" r="1.3" fill="var(--color-tooth-fluoride)" />
        </pattern>
        <pattern id="pd-bars" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="var(--color-tooth-pulpotomy-bg)" />
          <rect width="5" height="2" fill="var(--color-tooth-pulpotomy)" />
        </pattern>
      </defs>
    </svg>
  );
}

const ZONES = {
  top: "2,2 38,2 27,13 13,13",
  right: "38,2 38,38 27,27 27,13",
  bottom: "2,38 13,27 27,27 38,38",
  left: "2,2 13,13 13,27 2,38",
  center: "13,13 27,13 27,27 13,27",
} as const;
type Zone = keyof typeof ZONES;

/**
 * Where each surface sits, viewed from the front as on the paper chart. Upper teeth show buccal on top,
 * lower teeth on the bottom. The patient's right (quadrants 1, 4, 5, 8) is on the viewer's left, so
 * mesial (toward the midline) is on the right of those teeth.
 */
function zoneSurfaces(tooth: ToothNumber): Record<Zone, Surface> {
  const quadrant = Math.floor(tooth / 10);
  const upper = [1, 2, 5, 6].includes(quadrant);
  const patientRight = [1, 4, 5, 8].includes(quadrant);
  return {
    top: upper ? "B" : "L",
    bottom: upper ? "L" : "B",
    right: patientRight ? "M" : "D",
    left: patientRight ? "D" : "M",
    center: isAnterior(tooth) ? "I" : "O",
  };
}

export function describeTooth(tooth: ToothNumber, state?: ToothState): string {
  const parts = [
    state?.whole && CONDITION_STYLE[state.whole].label,
    ...surfacesFor(tooth).flatMap((s) => {
      const c = state?.surfaces[s];
      return c ? [`${s} ${CONDITION_STYLE[c].label.toLowerCase()}`] : [];
    }),
  ].filter(Boolean);
  return `Tooth ${tooth}: ${parts.length ? parts.join(", ") : "no findings"}`;
}

export function Tooth({
  tooth,
  state,
  selected,
  onSelect,
}: {
  tooth: ToothNumber;
  state?: ToothState;
  selected?: boolean;
  /** `surface` is set when a surface zone was clicked; keyboard activation selects the whole tooth. */
  onSelect?: (tooth: ToothNumber, surface?: Surface) => void;
}) {
  const surfaces = zoneSurfaces(tooth);
  const whole = state?.whole ? CONDITION_STYLE[state.whole] : undefined;
  const codes = [whole?.code, ...Object.values(state?.surfaces ?? {}).map((c) => CONDITION_STYLE[c].code)];
  const code = [...new Set(codes.filter(Boolean))].join(" ");
  const upper = [1, 2, 5, 6].includes(Math.floor(tooth / 10));

  const number = <span className="text-xs font-medium tabular-nums">{tooth}</span>;
  const codeLine = <span className="h-4 text-xs leading-4 font-semibold text-ink-muted">{code}</span>;

  return (
    <button
      type="button"
      data-tooth={tooth}
      aria-label={describeTooth(tooth, state)}
      aria-pressed={selected}
      onClick={() => onSelect?.(tooth)}
      className={cn(
        "flex w-full min-w-0 flex-col items-center gap-0.5 rounded-md p-0.5 outline-none",
        "hover:bg-ground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected && "bg-brand/10 ring-2 ring-brand",
      )}
    >
      {upper ? number : codeLine}
      <svg viewBox="0 0 40 40" className="aspect-square w-full max-w-14" aria-hidden>
        {(Object.keys(ZONES) as Zone[]).map((zone) => {
          const condition = state?.surfaces[surfaces[zone]];
          return (
            <polygon
              key={zone}
              points={ZONES[zone]}
              fill={condition ? CONDITION_STYLE[condition].fill : (whole?.fill ?? "var(--color-tooth-sound)")}
              stroke="var(--color-tooth-stroke)"
              strokeWidth="1.2"
              strokeDasharray={whole?.mark === "dashed" ? "3 2" : undefined}
              onClick={(e) => {
                if (!onSelect) return;
                e.stopPropagation();
                onSelect(tooth, surfaces[zone]);
              }}
            />
          );
        })}
        {whole?.mark === "cross" && (
          <path d="M4 4 36 36 M36 4 4 36" stroke="var(--color-tooth-mark)" strokeWidth="2.5" pointerEvents="none" />
        )}
      </svg>
      {upper ? codeLine : number}
    </button>
  );
}
