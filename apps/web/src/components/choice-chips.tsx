"use client";
import type { ReactNode } from "react";
import { RadioGroup } from "radix-ui";
import { cn } from "@/lib/utils";

export type Choice<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/**
 * One answer from a few visible options, as chips that wrap. Nothing is chosen until the user picks
 * (value "" or undefined). Radix RadioGroup: one tab stop, arrow keys move and select.
 * Name it with aria-labelledby (FormField's `${id}-label`) or aria-label.
 */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "chip",
  ...aria
}: {
  options: readonly Choice<T>[];
  value: T | "" | undefined;
  onChange: (value: T) => void;
  className?: string;
  /** "card": a taller two-line option (appointment slots). */
  size?: "chip" | "card";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <RadioGroup.Root value={value ?? ""} onValueChange={(v) => onChange(v as T)} className={cn("flex flex-wrap gap-2", className)} {...aria}>
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            "inline-flex min-h-(--control-h) flex-col items-start justify-center rounded-lg border border-control-border bg-surface px-3 text-left text-sm text-ink",
            "transition-colors duration-(--duration-fast) hover:border-line-strong",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "data-[state=checked]:border-ink data-[state=checked]:bg-selected data-[state=checked]:font-semibold",
            "aria-invalid:border-danger",
            size === "card" && "min-w-36 flex-1 py-2",
          )}
        >
          <span>{o.label}</span>
          {o.hint && <span className="text-xs font-normal text-ink-muted">{o.hint}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
