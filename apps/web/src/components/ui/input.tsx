import * as React from "react"
import { cn } from "@/lib/utils"

const DATE_LIKE = new Set(["date", "time", "datetime-local", "month", "week"])

/**
 * iOS Safari (matched by -webkit-touch-callout, which only it supports) draws date and time inputs as
 * native controls with their own minimum width and height, ignoring w-full and the control height:
 * the field ran past its card and stood taller than its neighbours. Dropping the native appearance
 * there lets them size like every other input; the native picker still opens on tap. iOS also centres
 * the value, so it is left-aligned to match the other fields.
 */
const IOS_DATE_FIX =
  "supports-[-webkit-touch-callout:none]:appearance-none [&::-webkit-date-and-time-value]:text-left"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-(--control-h) w-full min-w-0 rounded-md border border-input bg-surface px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        type && DATE_LIKE.has(type) && IOS_DATE_FIX,
        className
      )}
      {...props}
    />
  )
}

export { Input }
